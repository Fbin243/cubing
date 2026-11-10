import { useCallback, useEffect, useRef, useState } from 'react';
import { randomScrambleForEvent } from 'cubing/scramble';
import { TwistyPlayer } from 'cubing/twisty';
import { average, effectiveTime, formatTime, inspectionPenalty, mean, parseTime, type Penalty, type Solve } from './core';
import { loadData, saveData, parseData, type Data } from './storage';
import { ollCases, pllCases, type TrainingCase } from './training';
import { crossSolvedScramble, easyCrossScramble, singleSlotScramble, trainingScramble } from './training-scramble';

type Phase = 'idle' | 'holding' | 'ready' | 'inspection' | 'inspection-holding' | 'inspection-ready' | 'running';
type Mode = '333' | 'cross-solved' | 'easy-cross' | 'single-slot' | 'OLL' | 'PLL';
const trainingCases = { OLL: ollCases(), PLL: pllCases() };

function ScrambleDiagram({ scramble }: { scramble: string }) {
  const container = useRef<HTMLDivElement>(null);
  const player = useRef<TwistyPlayer | null>(null);
  useEffect(() => {
    const element = new TwistyPlayer({ puzzle: '3x3x3', visualization: '2D', controlPanel: 'none', background: 'none', viewerLink: 'none' });
    element.timestamp = 'end';
    player.current = element;
    container.current?.appendChild(element);
    return () => { element.remove(); player.current = null; };
  }, []);
  useEffect(() => { if (player.current) player.current.alg = scramble; }, [scramble]);
  return <div className="scramble-diagram" role="img" aria-label={`Cube state after scramble: ${scramble}`} ref={container} />;
}

function Trend({ solves }: { solves: Solve[] }) {
  const points = solves.map((s, i) => ({ i, time: effectiveTime(s) })).filter((p) => Number.isFinite(p.time));
  if (points.length < 2) return <p>Complete two solves to see your trend.</p>;
  const low = Math.min(...points.map((p) => p.time));
  const high = Math.max(...points.map((p) => p.time));
  const coords = points.map((p) => `${10 + p.i / Math.max(1, solves.length - 1) * 280},${90 - (p.time - low) / (high - low || 1) * 80}`).join(' ');
  return <svg className="trend" viewBox="0 0 300 100" role="img" aria-label={`Solve time trend. Best ${formatTime(low)}, slowest ${formatTime(high)}. DNF results omitted.`}><polyline points={coords} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>;
}

function TrainingSelector({ kind, selected, disabled, solves, onChange }: { kind: 'OLL' | 'PLL'; selected: string[]; disabled: boolean; solves: Solve[]; onChange: (keys: string[]) => void }) {
  const [preview, setPreview] = useState<{ key: string; scramble: string } | null>(null);
  const [previewStatus, setPreviewStatus] = useState('');
  const previewRequest = useRef(0);
  useEffect(() => { previewRequest.current++; setPreview(null); setPreviewStatus(''); return () => { previewRequest.current++; }; }, [kind]);
  const showPreview = async (item: TrainingCase) => {
    const request = ++previewRequest.current;
    setPreviewStatus(`Loading ${item.key}…`);
    try {
      const scramble = await trainingScramble(item);
      if (request === previewRequest.current) { setPreview({ key: item.key, scramble }); setPreviewStatus(''); }
    } catch { if (request === previewRequest.current) setPreviewStatus('Could not load pattern preview.'); }
  };
  return <><p>Pattern identifiers are internal, not standard case names. Scrambles use representative states and U adjustments, not uniform random states.</p>
    <details><summary>Choose {kind} patterns ({selected.length} of {trainingCases[kind].length})</summary>
      <div className="training-actions"><button disabled={disabled} onClick={() => onChange(trainingCases[kind].map((c) => c.key))}>Select all</button><button disabled={disabled} onClick={() => onChange([])}>Clear</button></div>
      {previewStatus && <p role="status">{previewStatus}</p>}
      {preview && <div><p>Preview: {kind} {preview.key}</p><ScrambleDiagram scramble={preview.scramble} /></div>}
      <div className="training-grid">{trainingCases[kind].map((item) => <div className="training-option" key={item.key}><label><input type="checkbox" checked={selected.includes(item.key)} disabled={disabled} onChange={(e) => onChange(e.target.checked ? [...selected, item.key] : selected.filter((key) => key !== item.key))} /> {item.key}</label><button type="button" disabled={disabled} aria-label={`Preview ${kind} pattern ${item.key}`} onClick={() => void showPreview(item)}>View</button></div>)}</div>
    </details>
    <details><summary>Pattern statistics</summary>{trainingCases[kind].filter((item) => solves.some((solve) => solve.trainingCase?.kind === kind && solve.trainingCase.key === item.key)).map((item) => { const results = solves.filter((solve) => solve.trainingCase?.kind === kind && solve.trainingCase.key === item.key); return <p key={item.key}>{item.key}: {results.length} solves · best {formatTime(Math.min(...results.map(effectiveTime)))} · mo3 {formatTime(mean(results, 3))}</p>; })}</details>
  </>;
}

export default function App() {
  const [data, setData] = useState<Data | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [sessionId, setSessionId] = useState('');
  const [scramble, setScramble] = useState('Generating scramble…');
  const [scrambleReady, setScrambleReady] = useState(false);
  const [mode, setMode] = useState<Mode>('333');
  const [selected, setSelected] = useState(() => ({ OLL: trainingCases.OLL.map((c) => c.key), PLL: trainingCases.PLL.map((c) => c.key) }));
  const modeRef = useRef<Mode>('333');
  const selectedRef = useRef(selected);
  const [scrambleCase, setScrambleCase] = useState<TrainingCase | null>(null);
  const scrambleRequest = useRef(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const phaseRef = useRef<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [inspection, setInspection] = useState(false);
  const [inspectionLeft, setInspectionLeft] = useState(15);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [manualTime, setManualTime] = useState('');
  const [importing, setImporting] = useState(false);
  const importInProgress = useRef(false);
  const started = useRef(0);
  const inspected = useRef(0);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerKeyHeld = useRef(false);
  const timerPointer = useRef<number | null>(null);
  const latest = useRef({ data, sessionId, scramble, scrambleCase });
  latest.current = { data, sessionId, scramble, scrambleCase };
  const changePhase = useCallback((p: Phase) => { phaseRef.current = p; setPhase(p); }, []);
  const nextScramble = useCallback(async () => {
    const request = ++scrambleRequest.current;
    setScrambleReady(false);
    setScramble('Generating scramble…');
    try {
      const currentMode = modeRef.current;
      const caseMode = currentMode === 'OLL' || currentMode === 'PLL';
      const candidates = caseMode ? trainingCases[currentMode].filter((c) => selectedRef.current[currentMode].includes(c.key)) : [];
      if (caseMode && !candidates.length) throw new Error('Select at least one training pattern.');
      const item = candidates.length ? candidates[crypto.getRandomValues(new Uint32Array(1))[0] % candidates.length] : null;
      const result = item ? await trainingScramble(item) : currentMode === 'cross-solved' ? await crossSolvedScramble() : currentMode === 'easy-cross' ? await easyCrossScramble() : currentMode === 'single-slot' ? await singleSlotScramble() : (await randomScrambleForEvent('333')).toString();
      if (request === scrambleRequest.current) { setScramble(result); setScrambleCase(item); setScrambleReady(true); setError(''); }
    } catch (err) { if (request === scrambleRequest.current) { const message = err instanceof Error && err.message === 'Select at least one training pattern.' ? err.message : 'Could not generate a scramble. Try again.'; setScramble('No scramble available'); setScrambleCase(null); setError(message); } }
  }, []);

  useEffect(() => {
    let active = true;
    loadData().then((d) => { if (active) { setData(d); setSessionId(d.sessions[0].id); } })
      .catch(() => { if (active) setStorageError('Could not read browser data.'); })
      .finally(() => { if (active) setLoadingData(false); });
    void nextScramble();
    return () => { active = false; };
  }, [nextScramble]);
  const updateData = useCallback((next: Data) => {
    latest.current = { ...latest.current, data: next };
    setData(next);
    void saveData(next).then(() => setStorageError('')).catch(() => setStorageError('Could not save data. Export a backup.'));
  }, []);

  const press = useCallback(() => {
    if (importInProgress.current) return;
    const current = phaseRef.current;
    if (current === 'running') {
      const timeMs = performance.now() - started.current;
      const snapshot = latest.current;
      if (snapshot.data) {
        const inspectionTime = started.current - inspected.current;
        const penalty: Penalty = inspected.current ? inspectionPenalty(inspectionTime) : 'ok';
        const solve: Solve = { id: crypto.randomUUID(), sessionId: snapshot.sessionId, timeMs, penalty, scramble: snapshot.scramble, createdAt: new Date().toISOString(), ...(snapshot.scrambleCase && { trainingCase: { kind: snapshot.scrambleCase.kind, key: snapshot.scrambleCase.key } }) };
        updateData({ ...snapshot.data, solves: [...snapshot.data.solves, solve] });
      }
      inspected.current = 0;
      setElapsed(timeMs);
      changePhase('idle');
      void nextScramble();
      return;
    }
    if (current !== 'idle' && current !== 'inspection') return;
    if (!data || !scrambleReady) return;
    if (current === 'idle' && inspection) { inspected.current = performance.now(); setInspectionLeft(15); changePhase('inspection'); return; }
    changePhase(current === 'inspection' ? 'inspection-holding' : 'holding');
    hold.current = setTimeout(() => changePhase(current === 'inspection' ? 'inspection-ready' : 'ready'), 350);
  }, [changePhase, data, inspection, nextScramble, scrambleReady, updateData]);

  const release = useCallback(() => {
    if (hold.current) clearTimeout(hold.current);
    const current = phaseRef.current;
    if (current === 'ready' || current === 'inspection-ready') { started.current = performance.now(); setElapsed(0); changePhase('running'); }
    else if (current === 'holding') changePhase('idle');
    else if (current === 'inspection-holding') changePhase('inspection');
  }, [changePhase]);

  const cancelHold = useCallback(() => {
    if (hold.current) clearTimeout(hold.current);
    if (phaseRef.current === 'holding' || phaseRef.current === 'ready') changePhase('idle');
    if (phaseRef.current === 'inspection-holding' || phaseRef.current === 'inspection-ready') changePhase('inspection');
  }, [changePhase]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest('input, button, select, textarea, summary, a[href], [role="button"]')))) return;
      event.preventDefault(); timerKeyHeld.current = true; press();
    };
    const up = (event: KeyboardEvent) => { if (event.code === 'Space' && timerKeyHeld.current) { timerKeyHeld.current = false; event.preventDefault(); release(); } };
    const blur = () => { timerKeyHeld.current = false; cancelHold(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); if (hold.current) clearTimeout(hold.current); };
  }, [press, release, cancelHold]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      if (phaseRef.current === 'running') setElapsed(performance.now() - started.current);
      if (phaseRef.current.startsWith('inspection')) setInspectionLeft(Math.ceil((15000 - (performance.now() - inspected.current)) / 1000));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const solves = data?.solves.filter((s) => s.sessionId === sessionId) ?? [];
  const mutateSolve = (id: string, penalty: Penalty) => { if (data) updateData({ ...data, solves: data.solves.map((s) => s.id === id ? { ...s, penalty } : s) }); };
  const addManualSolve = () => {
    const timeMs = parseTime(manualTime);
    if (timeMs === null) { setError('Enter a time in seconds or M:SS format, for example 12.34 or 1:02.34.'); return; }
    if (!data || !scrambleReady || phase !== 'idle') return;
    const solve: Solve = { id: crypto.randomUUID(), sessionId, timeMs, penalty: 'ok', scramble, createdAt: new Date().toISOString(), ...(scrambleCase && { trainingCase: { kind: scrambleCase.kind, key: scrambleCase.key } }) };
    updateData({ ...data, solves: [...data.solves, solve] });
    setManualTime(''); setError(''); void nextScramble();
  };
  const editSolve = (solve: Solve) => {
    if (!data || phase !== 'idle') return;
    const input = prompt('Time in seconds or M:SS', String(solve.timeMs / 1000));
    if (input === null) return;
    const timeMs = parseTime(input);
    if (timeMs === null) { setError('Invalid time. Use seconds or M:SS.'); return; }
    updateData({ ...data, solves: data.solves.map((s) => s.id === solve.id ? { ...s, timeMs } : s) }); setError('');
  };
  const exportData = () => {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'cubing-backup.json'; link.click(); URL.revokeObjectURL(url);
  };
  const importData = async (file?: File) => {
    if (!file || loadingData || importInProgress.current || phaseRef.current !== 'idle' || !confirm('Replace all current data with this backup?')) return;
    importInProgress.current = true;
    setImporting(true);
    try { const next = parseData(JSON.parse(await file.text())); await saveData(next); latest.current = { ...latest.current, data: next, sessionId: next.sessions[0].id }; setData(next); setSessionId(next.sessions[0].id); setError(''); setStorageError(''); }
    catch { setError('Could not import backup. Current data has not been changed.'); }
    finally { importInProgress.current = false; setImporting(false); }
  };

  return <main className="shell">
    <header><div><span className="eyebrow">CUBING / 3×3×3</span><h1>Every turn, a step forward.</h1><p>A little space for your solves.</p></div><div className="header-actions"><button onClick={exportData}>Export data</button><label className="button">Import data<input type="file" accept="application/json" hidden disabled={loadingData || phase !== 'idle' || importing} onChange={(e) => { void importData(e.target.files?.[0]); e.currentTarget.value = ''; }} /></label></div></header>
    {storageError && <p className="error" role="alert">{storageError}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {importing && <p role="status">Importing backup…</p>}
    <fieldset disabled={importing} className="import-lock">
    <div className="layout"><section className="timer-panel" aria-label="Timer">
      <div className="panel-heading"><div><span className="eyebrow">SCRAMBLE{scrambleReady && scrambleCase ? ` / ${scrambleCase.kind} ${scrambleCase.key}` : ''}</span><p className="scramble">{scramble}</p></div><button onClick={() => void nextScramble()} disabled={phase !== 'idle'}>New scramble</button></div>
      {scrambleReady && <ScrambleDiagram scramble={scramble} />}
      <div className="timer-area" onPointerDown={(e) => { if (!e.isPrimary || e.button !== 0 || timerPointer.current !== null) return; timerPointer.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); press(); }} onPointerUp={(e) => { if (timerPointer.current !== e.pointerId) return; timerPointer.current = null; release(); }} onPointerCancel={(e) => { if (timerPointer.current !== e.pointerId) return; timerPointer.current = null; cancelHold(); }} onLostPointerCapture={(e) => { if (timerPointer.current !== e.pointerId) return; timerPointer.current = null; cancelHold(); }}>
        <span className={`time ${phase.includes('ready') ? 'ready' : ''}`}>{phase.startsWith('inspection') ? inspectionLeft : formatTime(elapsed)}</span>
        <span className="hint">{phase === 'running' ? 'Press to stop' : 'Hold Space or touch to start'}</span>
      </div>
      <div className="controls"><label><input type="checkbox" checked={inspection} onChange={(e) => setInspection(e.target.checked)} disabled={phase !== 'idle'} /> 15-second inspection</label><span>{mode === '333' ? '3×3 random-state' : mode === 'cross-solved' ? 'Cross solved / F2L practice' : mode === 'easy-cross' ? 'D cross: at most 4 face turns' : mode === 'single-slot' ? 'Single-slot F2L practice' : `${mode} representative states`}</span></div>
      <form className="manual" onSubmit={(e) => { e.preventDefault(); addManualSolve(); }}><label htmlFor="manual-time">Enter a time</label><input id="manual-time" inputMode="decimal" placeholder="12.34 or 1:02.34" value={manualTime} onChange={(e) => setManualTime(e.target.value)} /><button disabled={phase !== 'idle' || !scrambleReady || !data}>Add solve</button></form>
    </section><aside><section className="box"><div className="row"><h2>Session</h2><button disabled={phase !== 'idle'} onClick={() => { if (!data) return; const name = prompt('New session name'); if (!name?.trim()) return; const session = { id: crypto.randomUUID(), name: name.trim() }; updateData({ ...data, sessions: [...data.sessions, session] }); setSessionId(session.id); }}>+ New</button></div>
      <select aria-label="Select session" disabled={phase !== 'idle'} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>{data?.sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <div className="session-actions"><button disabled={phase !== 'idle' || !data} onClick={() => { if (!data) return; const session = data.sessions.find((s) => s.id === sessionId); if (!session) return; const name = prompt('Rename session', session.name)?.trim(); if (name) updateData({ ...data, sessions: data.sessions.map((s) => s.id === sessionId ? { ...s, name } : s) }); }}>Rename</button><button disabled={phase !== 'idle' || !data || data.sessions.length < 2} onClick={() => { if (!data || data.sessions.length < 2 || !confirm('Delete this session and all its solves? This cannot be undone.')) return; const sessions = data.sessions.filter((s) => s.id !== sessionId); updateData({ ...data, sessions, solves: data.solves.filter((s) => s.sessionId !== sessionId) }); setSessionId(sessions[0].id); }}>Delete session</button></div>
      <div className="stats"><div><span>BEST</span><strong>{formatTime(solves.length ? Math.min(...solves.map(effectiveTime)) : null)}</strong></div><div><span>MO3</span><strong>{formatTime(mean(solves, 3))}</strong></div>{[5, 12, 100].map((n) => <div key={n}><span>AO{n}</span><strong>{formatTime(average(solves, n))}</strong></div>)}</div>
    </section><section className="box"><div className="row"><h2>History</h2><span>{solves.length} solves</span></div>{solves.length === 0 ? <p>No solves yet.</p> : <ol className="history">{[...solves].reverse().map((s) => <li key={s.id}><span>{formatTime(effectiveTime(s))}{s.penalty === '+2' ? '+' : ''}</span><select aria-label="Penalty" disabled={phase !== 'idle'} value={s.penalty} onChange={(e) => mutateSolve(s.id, e.target.value as Penalty)}><option value="ok">OK</option><option value="+2">+2</option><option value="dnf">DNF</option></select><button disabled={phase !== 'idle'} onClick={() => editSolve(s)}>Edit</button><button disabled={phase !== 'idle'} onClick={() => { if (data && confirm('Delete this solve?')) updateData({ ...data, solves: data.solves.filter((item) => item.id !== s.id) }); }}>Delete</button><details className="solve-details"><summary>Details</summary><p><strong>Scramble:</strong> {s.scramble}</p><p><strong>Recorded:</strong> {Number.isNaN(Date.parse(s.createdAt)) ? s.createdAt : new Date(s.createdAt).toLocaleString()}</p>{s.trainingCase && <p><strong>Pattern:</strong> {s.trainingCase.kind} {s.trainingCase.key}</p>}</details></li>)}</ol>}</section>
    <section className="box"><h2>Progress</h2><Trend solves={solves} /></section>
    <section className="box"><h2>Scramble mode</h2><select aria-label="Scramble mode" value={mode} disabled={phase !== 'idle'} onChange={(e) => { const next = e.target.value as Mode; modeRef.current = next; setMode(next); void nextScramble(); }}><option value="333">3×3 random-state</option><option value="cross-solved">Cross solved / F2L practice</option><option value="single-slot">Single-slot F2L practice</option><option value="easy-cross">Easy D cross (up to 4 turns)</option><option value="OLL">OLL patterns</option><option value="PLL">PLL patterns</option></select>
      {mode === 'single-slot' && <p>D cross and three F2L slots are solved; the R U R&apos; slot remains. Last layer varies. Cases are not uniformly distributed and are not named.</p>}
      {mode === 'easy-cross' && <p>The D cross can be solved in at most four face turns; it may be easier or already solved. States are not uniformly distributed.</p>}
      {(mode === 'OLL' || mode === 'PLL') && <TrainingSelector kind={mode} selected={selected[mode]} disabled={phase !== 'idle'} solves={solves} onChange={(keys) => { const next = { ...selectedRef.current, [mode]: keys }; selectedRef.current = next; setSelected(next); void nextScramble(); }} />}
    </section></aside></div>
    </fieldset>
  </main>;
}
