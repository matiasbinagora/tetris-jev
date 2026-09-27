'use client';

import { useEffect, useState } from 'react';
import { requestJevDecision } from './jev-decision-api';
import { BoardView } from './board-view';
import { handleFocusedGameKey } from './game-keyboard';
import {
  beginJevDecision,
  completeJevDecision,
  failJevDecision,
  retryJevDecision,
  type JevDecisionSession,
} from '../game/jev-decision-session';
import {
  createMatchSession,
  pauseMatchSession,
  restartMatchSession,
  resumeMatchSession,
  startMatchSession,
  tickMatchSession,
  type MatchSessionState,
} from '../game/match-session';
import { applyHumanGameAction } from '../game/human-controls';
import { MATCH_GRAVITY_INTERVAL_MS, peekNextPiece } from '../game/match';

interface ViewState {
  session: MatchSessionState;
  decision: JevDecisionSession | null;
  completedDecisions: number;
  matchId: string;
  decisionSetupFailed: boolean;
}

const INITIAL_SEED = 20260927;

function freshSeed(previous: number): number {
  let seed: number;
  do {
    seed = crypto.getRandomValues(new Uint32Array(1))[0];
  } while (seed === 0 || seed === previous);
  return seed;
}

function beginJevIfActive(session: MatchSessionState, completedDecisions: number, matchId: string): ViewState {
  const needsDecision = session.phase === 'playing' && session.core.jev.activePiece !== null;
  const decision =
    needsDecision
      ? beginJevDecision(session, `${matchId}:${session.core.roundIndex}`)
      : null;
  return {
    session: decision?.session ?? (needsDecision ? pauseMatchSession(session) : session),
    decision,
    completedDecisions,
    matchId,
    decisionSetupFailed: needsDecision && decision === null,
  };
}

function statusFor(state: ViewState): { name: string; message: string } {
  if (state.decisionSetupFailed) {
    return { name: 'Match stopped', message: 'Jev could not prepare a legal decision for this round.' };
  }
  if (state.decision?.status === 'pending') {
    return { name: 'Jev deciding', message: 'Both boards are paused while Jev chooses a legal landing.' };
  }
  if (state.decision?.status === 'retry-required') {
    return { name: 'Retry required', message: 'Jev did not return a usable choice. The round is unchanged.' };
  }
  switch (state.session.phase) {
    case 'ready':
      return { name: 'Ready', message: 'The same piece sequence is prepared for both boards.' };
    case 'playing':
      return { name: 'Playing', message: 'One shared gravity clock is running.' };
    case 'paused':
      return { name: 'Paused', message: 'The boards and shared clock are paused.' };
    case 'finished': {
      const result = state.session.result;
      return {
        name: 'Finished',
        message: result?.kind === 'draw'
          ? 'The match ended in a draw.'
          : result?.winner === 'human'
            ? 'You win this match.'
            : 'Jev wins this match.',
      };
    }
  }
}

export function MatchApp() {
  const [state, setState] = useState<ViewState>(() => ({
    session: createMatchSession(INITIAL_SEED),
    decision: null,
    completedDecisions: 0,
    matchId: 'ready',
    decisionSetupFailed: false,
  }));

  const decision = state.decision;
  const decisionId = decision?.token.decisionId;
  const attempt = decision?.token.attempt;
  const decisionStatus = decision?.status;

  useEffect(() => {
    if (decisionStatus !== 'pending' || !decision) return;
    const controller = new AbortController();
    const token = decision.token;

    void requestJevDecision(decision.snapshot, fetch, controller.signal).then((response) => {
      if (controller.signal.aborted) return;
      setState((current) => {
        if (!current.decision || current.decision.token.decisionId !== token.decisionId ||
          current.decision.token.attempt !== token.attempt || current.decision.status !== 'pending') {
          return current;
        }
        const next = response.ok
          ? completeJevDecision(current.decision, token, response.result)
          : failJevDecision(current.decision, token);
        if (next.status !== 'complete') {
          return { ...current, decision: next };
        }
        return beginJevIfActive(next.session, current.completedDecisions + 1, current.matchId);
      });
    });

    return () => controller.abort();
    // The token identifies one immutable decision snapshot and request attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionId, attempt, decisionStatus]);

  useEffect(() => {
    if (state.session.phase !== 'playing' || state.decision !== null) return;
    const interval = window.setInterval(() => {
      setState((current) => {
        if (current.session.phase !== 'playing' || current.decision !== null) return current;
        return beginJevIfActive(tickMatchSession(current.session), current.completedDecisions, current.matchId);
      });
    }, MATCH_GRAVITY_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [state.session.phase, state.decision]);

  const { core } = state.session;
  const status = statusFor(state);
  const nextPiece = peekNextPiece(core);
  const humanStatus = core.human.topOut
    ? 'Topped out'
    : core.human.lockedThisRound
      ? 'Waiting for Jev'
      : 'Current piece active';
  const jevStatus = core.jev.topOut
    ? 'Topped out'
    : core.jev.lockedThisRound
      ? 'Waiting for you'
      : state.decisionSetupFailed
        ? 'Decision unavailable'
      : decisionStatus === 'pending'
        ? 'Choosing a placement'
        : decisionStatus === 'retry-required'
          ? 'Decision interrupted'
          : 'Current piece active';
  const keyboardState = {
    phase: state.session.phase,
    hasJevDecision: state.decision !== null,
    decisionSetupFailed: state.decisionSetupFailed,
    humanHasActivePiece: core.human.activePiece !== null,
    humanLockedThisRound: core.human.lockedThisRound,
  };

  return (
    <main className="match-shell">
      <section className="player-area player-area--human" aria-labelledby="human-heading">
        <div className="area-header">
          <div>
            <p className="eyebrow">01 / Human player</p>
            <h1 id="human-heading">Your board</h1>
          </div>
          <div className="status-pill"><span className="status-pill__dot" />{humanStatus}</div>
        </div>

        <div className="human-content">
          <div className="game-sidebar">
            <div className="brand-mark" aria-hidden="true">T<span>:</span>J</div>
            <div className="round-card">
              <span className="card-label">Round</span>
              <strong>{String(core.roundIndex + 1).padStart(2, '0')}</strong>
              <span className="card-note">Shared sequence</span>
            </div>
            <div className="piece-card">
              <span className="card-label">Current</span>
              <strong className={`piece-letter piece-letter--${core.currentPiece.toLowerCase()}`}>{core.currentPiece}</strong>
              <span className="card-note">Both players</span>
            </div>
            <div className="piece-card">
              <span className="card-label">Next up</span>
              <strong className={`piece-letter piece-letter--${nextPiece.toLowerCase()}`}>{nextPiece}</strong>
              <span className="card-note">Seven-bag draw</span>
            </div>
          </div>

          <div
            className="board-wrap board-wrap--human"
            role="group"
            tabIndex={0}
            aria-label="Human game board controls"
            aria-describedby="human-controls-help"
            onKeyDown={(event) => handleFocusedGameKey(
              event.nativeEvent,
              keyboardState,
              (action) => setState((current) => {
                if (current.decision !== null || current.decisionSetupFailed) return current;
                const session = applyHumanGameAction(current.session, action);
                if (session === current.session) return current;
                return beginJevIfActive(session, current.completedDecisions, current.matchId);
              }),
              () => setState((current) => {
                if (current.decision !== null || current.decisionSetupFailed) return current;
                const session = current.session.phase === 'playing'
                  ? pauseMatchSession(current.session)
                  : current.session.phase === 'paused'
                    ? resumeMatchSession(current.session)
                    : current.session;
                return session === current.session ? current : { ...current, session };
              }),
            )}
          >
            <BoardView board={core.human.board} activePiece={core.human.activePiece} label="Human Tetris board, 10 columns by 20 visible rows" player="human" />
            <div className="board-caption"><span>Human</span><span>10 × 20</span></div>
          </div>
        </div>

        <div className="area-footer">
          <span>Same pieces. Different decisions.</span>
          <p id="human-controls-help" className="control-help">
            <kbd>←</kbd>/<kbd>→</kbd> move · <kbd>↓</kbd> soft drop · <kbd>↑</kbd>/<kbd>X</kbd> rotate · <kbd>Z</kbd> reverse · <kbd>Space</kbd> hard drop · <kbd>P</kbd> pause/resume
          </p>
        </div>
      </section>

      <div className="right-column">
        <section className="player-area player-area--jev" aria-labelledby="jev-heading">
          <div className="area-header area-header--compact">
            <div>
              <p className="eyebrow">02 / Decision model</p>
              <h2 id="jev-heading">Jev&apos;s board</h2>
            </div>
            <div className="status-pill status-pill--jev"><span className="status-pill__dot" />{jevStatus}</div>
          </div>
          <div className="jev-content">
            <div className="board-wrap board-wrap--jev">
              <BoardView board={core.jev.board} activePiece={core.jev.activePiece} label="Jev Tetris board, 10 columns by 20 visible rows" player="jev" />
              <div className="board-caption"><span>Jev</span><span>10 × 20</span></div>
            </div>
            <div className="jev-side-note">
              <span className="vertical-rule" />
              <span>One sequence<br />Two independent boards</span>
              <strong>{core.currentPiece} <span>→</span> {nextPiece}</strong>
              <small>Current / Next</small>
            </div>
          </div>
        </section>

        <section className="decision-area" aria-labelledby="match-status-heading">
          <div className="decision-heading">
            <p className="eyebrow">03 / Match status</p>
            <span className="round-indicator">ROUND {String(core.roundIndex + 1).padStart(2, '0')}</span>
          </div>
          <div className="decision-main" aria-live="polite">
            <div>
              <h2 id="match-status-heading">{status.name}</h2>
              <p>{status.message}</p>
            </div>
            <div className="match-actions">
              {state.session.phase === 'ready' && (
                <button type="button" className="action-button" onClick={() => {
                  const matchId = crypto.randomUUID();
                  setState((current) => beginJevIfActive(startMatchSession(current.session), current.completedDecisions, matchId));
                }}>Start match <span aria-hidden="true">↗</span></button>
              )}
              {state.session.phase === 'playing' && state.decision === null && (
                <button type="button" className="action-button" onClick={() => setState((current) => ({ ...current, session: pauseMatchSession(current.session) }))}>Pause <span aria-hidden="true">Ⅱ</span></button>
              )}
              {state.session.phase === 'paused' && state.decision === null && !state.decisionSetupFailed && (
                <button type="button" className="action-button" onClick={() => setState((current) => ({ ...current, session: resumeMatchSession(current.session) }))}>Resume <span aria-hidden="true">▶</span></button>
              )}
              {decisionStatus === 'retry-required' && (
                <button type="button" className="action-button" onClick={() => setState((current) => current.decision ? { ...current, decision: retryJevDecision(current.decision) } : current)}>Retry Jev <span aria-hidden="true">↻</span></button>
              )}
              {state.session.phase !== 'ready' && (
                <button type="button" className="text-button" onClick={() => {
                  const matchId = crypto.randomUUID();
                  const seed = freshSeed(state.session.core.seed);
                  setState(() => beginJevIfActive(restartMatchSession(seed), 0, matchId));
                }}>New match</button>
              )}
            </div>
          </div>
          <div className="decision-footer"><span>Jev decisions completed</span><strong>{String(state.completedDecisions).padStart(2, '0')}</strong></div>
        </section>
      </div>
    </main>
  );
}
