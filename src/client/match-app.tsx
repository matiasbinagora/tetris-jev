'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { requestJevDecision } from './jev-decision-api';
import { BoardView } from './board-view';
import { handleGameKey } from './game-keyboard';
import {
  applyJevLanding,
  beginJevDecision,
  completeJevDecision,
  failJevDecision,
  retryJevDecision,
  resumeCompletedJevDecision,
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
import type { ActivePiece } from '../game/engine';
import { applyHumanGameAction } from '../game/human-controls';
import { JEV_DECISION_CADENCE_MS, MATCH_GRAVITY_INTERVAL_MS, getPlayerPiece, peekNextPlayerPiece } from '../game/match';
import { JevDecisionPanel, type CompletedDecisionFacts } from './jev-decision-panel';
import { JevPanelResizer } from './jev-panel-resizer';

interface ViewState {
  session: MatchSessionState;
  decision: JevDecisionSession | null;
  completedDecisions: number;
  matchId: string;
  decisionSetupFailed: boolean;
  lastDecision: CompletedDecisionFacts | null;
  landingStage: 1 | 2 | null;
}

const INITIAL_SEED = 20260927;

function freshSeed(previous: number): number {
  let seed: number;
  do {
    seed = crypto.getRandomValues(new Uint32Array(1))[0];
  } while (seed === 0 || seed === previous);
  return seed;
}

function beginJevIfActive(
  session: MatchSessionState,
  completedDecisions: number,
  matchId: string,
  lastDecision: CompletedDecisionFacts | null,
): ViewState {
  const needsDecision = session.phase === 'playing' && session.core.jev.activePiece !== null;
  const decision =
    needsDecision
      ? beginJevDecision(session, `${matchId}:${session.core.jev.sequenceIndex}`)
      : null;
  return {
    session,
    decision,
    completedDecisions,
    matchId,
    decisionSetupFailed: needsDecision && decision === null,
    lastDecision,
    landingStage: null,
  };
}

function finishJevLanding(state: ViewState, token: { decisionId: string; attempt: number }): ViewState {
  const decision = state.decision;
  if (
    state.session.phase !== 'playing' ||
    decision?.status !== 'animating' ||
    decision.token.decisionId !== token.decisionId ||
    decision.token.attempt !== token.attempt
  ) return state;

  const landed = applyJevLanding(decision);
  if (landed.status !== 'complete' || landed.result === null) return state;
  return {
    ...state,
    session: landed.session,
    decision: null,
    landingStage: null,
    completedDecisions: state.completedDecisions + 1,
    lastDecision: { snapshot: decision.snapshot, result: landed.result },
  };
}

function midpointPiece(start: ActivePiece, landing: ActivePiece): ActivePiece {
  return {
    ...start,
    x: Math.round((start.x + landing.x) / 2),
    y: Math.round((start.y + landing.y) / 2),
  };
}

function presentationPiece(decision: JevDecisionSession | null, stage: 1 | 2 | null): ActivePiece | null {
  if (decision?.status !== 'animating' || decision.result === null || stage === null) return null;
  const landing = decision.result.selectedCandidate.lockedPiece;
  return stage === 1 ? midpointPiece(decision.snapshot.piece, landing) : landing;
}

function statusFor(state: ViewState): { name: string; message: string } {
  if (state.session.phase === 'finished') {
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
  if (state.decisionSetupFailed) {
    return { name: 'Match stopped', message: 'Jev could not prepare a legal decision for this round.' };
  }
  if (state.session.phase === 'paused') {
    return {
      name: 'Paused',
      message: state.decision?.status === 'ready-to-apply'
        ? 'Both players are paused. Jev’s response will apply when you resume.'
        : 'Both players and the human gravity clock are paused.',
    };
  }
  if (state.decision?.status === 'pending') {
    return { name: 'Jev deciding', message: 'Jev is choosing while your board keeps playing.' };
  }
  if (state.decision?.status === 'retry-required') {
    return { name: 'Retry required', message: 'Your board keeps playing. Retry Jev on the same board and piece.' };
  }
  if (state.decision?.status === 'ready-to-apply') {
    return { name: 'Jev ready', message: 'Jev’s choice will apply when you resume the match.' };
  }
  if (state.decision?.status === 'animating') {
    return { name: 'Jev landing', message: 'Jev is showing the selected landing.' };
  }
  switch (state.session.phase) {
    case 'ready':
      return { name: 'Ready', message: 'The same piece sequence is prepared for both boards.' };
    case 'playing':
      return { name: 'Playing', message: 'Your board has its own gravity clock; Jev plays between decisions.' };
  }
}

export function MatchApp() {
  const humanBoardRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ViewState>(() => ({
    session: createMatchSession(INITIAL_SEED),
    decision: null,
    completedDecisions: 0,
    matchId: 'ready',
    decisionSetupFailed: false,
    lastDecision: null,
    landingStage: null,
  }));

  const decision = state.decision;
  const decisionId = decision?.token.decisionId;
  const attempt = decision?.token.attempt;
  const decisionToken = decision?.token ?? null;
  const decisionStatus = decision?.status;

  useEffect(() => {
    if (decisionStatus !== 'pending' || !decision) return;
    const controller = new AbortController();
    const token = decision.token;

    void requestJevDecision(decision.snapshot, fetch, controller.signal).then((response) => {
      if (controller.signal.aborted) return;
      setState((current) => {
        if (current.session.phase === 'finished') return { ...current, decision: null };
        if (!current.decision || current.decision.token.decisionId !== token.decisionId ||
          current.decision.token.attempt !== token.attempt || current.decision.status !== 'pending') {
          return current;
        }
        const next = response.ok
          ? completeJevDecision(current.decision, token, response.result, current.session)
          : failJevDecision(current.decision, token);
        if (next.status === 'animating') {
          return { ...current, decision: next, landingStage: 1 };
        }
        if (next.status !== 'complete') {
          return { ...current, decision: next };
        }
        if (next.result === null) return { ...current, decision: next };
        if (next.status !== 'complete' || next.result === null) return { ...current, decision: next };
        return {
          ...current,
          session: next.session,
          decision: null,
          landingStage: null,
          completedDecisions: current.completedDecisions + 1,
          lastDecision: { snapshot: current.decision.snapshot, result: next.result },
        };
      });
    });

    return () => controller.abort();
    // The token identifies one immutable decision snapshot and request attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionId, attempt, decisionStatus]);

  useEffect(() => {
    if (decisionStatus !== 'animating' || !decisionToken || state.session.phase !== 'playing' || state.landingStage === null) return;

    const token = decisionToken;
    const stage = state.landingStage;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const timeout = window.setTimeout(() => setState((current) => finishJevLanding(current, token)), 0);
      return () => window.clearTimeout(timeout);
    }

    const timeout = window.setTimeout(() => {
      setState((current) => {
        if (
          current.session.phase !== 'playing' ||
          current.matchId !== state.matchId ||
          current.decision?.status !== 'animating' ||
          current.decision.token.decisionId !== token.decisionId ||
          current.decision.token.attempt !== token.attempt ||
          current.landingStage !== stage
        ) return current;
        if (stage === 1) return { ...current, landingStage: 2 };
        return finishJevLanding(current, token);
      });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [decisionId, attempt, decisionStatus, decisionToken, state.session.phase, state.landingStage, state.matchId]);

  useEffect(() => {
    if (state.session.phase !== 'playing') return;
    const interval = window.setInterval(() => {
      setState((current) => {
        if (current.session.phase !== 'playing') return current;
        const session = tickMatchSession(current.session);
        return { ...current, session, ...(session.phase === 'finished' ? { decision: null, landingStage: null } : {}) };
      });
    }, MATCH_GRAVITY_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [state.session.phase]);

  useEffect(() => {
    if (state.session.phase !== 'playing' || state.decision !== null || state.decisionSetupFailed ||
      state.session.core.jev.activePiece === null) return;
    const timeout = window.setTimeout(() => {
      setState((current) => current.decision === null
        ? beginJevIfActive(current.session, current.completedDecisions, current.matchId, current.lastDecision)
        : current);
    }, JEV_DECISION_CADENCE_MS);
    return () => window.clearTimeout(timeout);
  }, [state.session.phase, state.session.core.jev.sequenceIndex, state.session.core.jev.activePiece, state.decision, state.decisionSetupFailed]);

  const { core } = state.session;
  const status = statusFor(state);
  const humanPiece = getPlayerPiece(core, core.human);
  const humanNextPiece = peekNextPlayerPiece(core, core.human);
  const jevPiece = getPlayerPiece(core, core.jev);
  const jevNextPiece = peekNextPlayerPiece(core, core.jev);
  const sequenceLead = core.human.sequenceIndex === core.jev.sequenceIndex
    ? 'Same pace'
    : core.human.sequenceIndex > core.jev.sequenceIndex
      ? `You +${core.human.sequenceIndex - core.jev.sequenceIndex}`
      : `Jev +${core.jev.sequenceIndex - core.human.sequenceIndex}`;
  const humanStatus = core.human.topOut
    ? 'Topped out'
        : core.human.lockedThisRound
      ? 'Next piece ready'
      : 'Current piece active';
  const jevStatus = core.jev.topOut
    ? 'Topped out'
      : core.jev.lockedThisRound
      ? 'Next piece ready'
      : state.decisionSetupFailed
        ? 'Decision unavailable'
      : decisionStatus === 'pending'
        ? 'Choosing a placement'
        : decisionStatus === 'retry-required'
          ? 'Decision interrupted'
          : 'Current piece active';
  const keyboardState = useMemo(() => ({
    phase: state.session.phase,
    humanHasActivePiece: core.human.activePiece !== null,
    humanLockedThisRound: core.human.lockedThisRound,
  }), [state.session.phase, core.human.activePiece, core.human.lockedThisRound]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      handleGameKey(
        event,
        keyboardState,
        (action) => setState((current) => {
          if (current.session.phase !== 'playing') return current;
          const session = applyHumanGameAction(current.session, action);
          return session === current.session ? current : {
            ...current, session, ...(session.phase === 'finished' ? { decision: null, landingStage: null } : {}),
          };
        }),
        () => setState((current) => {
          const session = current.session.phase === 'playing'
            ? pauseMatchSession(current.session)
            : current.session.phase === 'paused'
              ? resumeMatchSession(current.session)
              : current.session;
          if (session === current.session) return current;
          if (session.phase === 'playing' && current.decision?.status === 'ready-to-apply') {
            const resumed = resumeCompletedJevDecision({ ...current.decision, session: current.session });
            return { ...current, session: resumed.session, decision: resumed,
              landingStage: resumed.status === 'animating' ? 1 : current.landingStage };
          }
          return { ...current, session };
        }),
      );
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keyboardState]);

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
              <strong>{String(core.human.sequenceIndex + 1).padStart(2, '0')}</strong>
              <span className="card-note">Your piece</span>
              <span className="card-note">{core.human.survivedPieces} pieces survived</span>
            </div>
            <div className="piece-card">
              <span className="card-label">Current</span>
              <strong className={`piece-letter piece-letter--${humanPiece.toLowerCase()}`}>{humanPiece}</strong>
              <span className="card-note">Your board</span>
            </div>
            <div className="piece-card">
              <span className="card-label">Next up</span>
              <strong className={`piece-letter piece-letter--${humanNextPiece.toLowerCase()}`}>{humanNextPiece}</strong>
              <span className="card-note">Seven-bag draw</span>
            </div>
          </div>

          <div
            className="board-wrap board-wrap--human"
            ref={humanBoardRef}
            role="group"
            tabIndex={0}
            aria-label="Human game board controls"
            aria-describedby="human-controls-help"
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

      <JevPanelResizer>{[
        <section key="jev-board" className="player-area player-area--jev" aria-labelledby="jev-heading">
          <div className="area-header area-header--compact">
            <div>
              <p className="eyebrow">02 / Decision model</p>
              <h2 id="jev-heading">Jev&apos;s board</h2>
            </div>
            <div className="status-pill status-pill--jev"><span className="status-pill__dot" />{jevStatus}</div>
          </div>
          <div className="jev-content">
            <div className="board-wrap board-wrap--jev">
              <BoardView
                board={core.jev.board}
                activePiece={core.jev.activePiece}
                presentationPiece={presentationPiece(state.decision, state.landingStage)}
                landingStage={state.landingStage}
                paused={state.session.phase === 'paused'}
                label="Jev Tetris board, 10 columns by 20 visible rows"
                player="jev"
              />
              <div className="board-caption"><span>Jev</span><span>10 × 20</span></div>
            </div>
            <div className="jev-side-note">
              <span className="vertical-rule" />
              <span>One sequence<br />Two independent boards</span>
              <strong>{jevPiece} <span>→</span> {jevNextPiece}</strong>
              <small>Current / Next</small>
              <small>{core.jev.survivedPieces} pieces survived</small>
            </div>
          </div>
        </section>,

        <section key="decision-panel" className="decision-area" aria-labelledby="match-status-heading">
          <div className="decision-heading">
            <p className="eyebrow">03 / Match status</p>
            <span className="round-indicator">HUMAN {String(core.human.sequenceIndex + 1).padStart(2, '0')} · JEV {String(core.jev.sequenceIndex + 1).padStart(2, '0')} · {sequenceLead}</span>
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
                  setState((current) => beginJevIfActive(
                    startMatchSession(current.session), current.completedDecisions, matchId, null,
                  ));
                  humanBoardRef.current?.focus();
                }}>Start match <span aria-hidden="true">↗</span></button>
              )}
              {state.session.phase === 'playing' && (
                <button type="button" className="action-button" onClick={() => setState((current) => ({ ...current, session: pauseMatchSession(current.session) }))}>Pause <span aria-hidden="true">Ⅱ</span></button>
              )}
              {state.session.phase === 'paused' && !state.decisionSetupFailed && (
                <button type="button" className="action-button" onClick={() => {
                  setState((current) => {
                    const session = resumeMatchSession(current.session);
                    if (session === current.session) return current;
                    if (current.decision?.status === 'ready-to-apply') {
                      const resumed = resumeCompletedJevDecision({ ...current.decision, session: current.session });
                      return { ...current, session: resumed.session, decision: resumed,
                        landingStage: resumed.status === 'animating' ? 1 : current.landingStage };
                    }
                    return { ...current, session };
                  });
                  humanBoardRef.current?.focus();
                }}>Resume <span aria-hidden="true">▶</span></button>
              )}
              {decisionStatus === 'retry-required' && (
                <button type="button" className="action-button" onClick={() => setState((current) => current.decision ? { ...current, decision: retryJevDecision(current.decision) } : current)}>Retry Jev <span aria-hidden="true">↻</span></button>
              )}
              {state.session.phase !== 'ready' && (
                <button type="button" className="text-button" onClick={() => {
                  const matchId = crypto.randomUUID();
                  const seed = freshSeed(state.session.core.seed);
                  setState(() => beginJevIfActive(restartMatchSession(seed), 0, matchId, null));
                }}>New match</button>
              )}
            </div>
          </div>
          <JevDecisionPanel
            facts={state.decision === null && !state.decisionSetupFailed ? state.lastDecision : null}
          />
          <div className="decision-footer"><span>Jev decisions completed</span><strong>{String(state.completedDecisions).padStart(2, '0')}</strong></div>
        </section>,
      ]}</JevPanelResizer>
    </main>
  );
}
