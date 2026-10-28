import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity, ArrowDownToLine, BarChart3, Check, ChevronDown, CircleHelp, Clock3, Coffee,
  Focus, History, ListTodo, Moon, MoreHorizontal, Pause, Play, Plus, RotateCcw, Search,
  Settings2, SkipForward, Sparkles, Sun, Target, Trash2, Upload, X
} from "lucide-react";
import {
  advanceTimer, createInitialData, createTask, deleteAllData, deleteTask, exportData, formatTime,
  importData, localDayKey, loadData, pauseTimer, resetTimer, saveData, selectMode,
  skipTimer, startTimer, toggleTask, updateTask, type FocusSession, type NexusData,
  type Priority, type Task, type TimerMode
} from "@nexus/core";
import { webStorage } from "./storage.js";

const modeLabels: Record<TimerMode, string> = { focus: "Deep focus", shortBreak: "Short break", longBreak: "Long break" };
const modeIcons: Record<TimerMode, typeof Focus> = { focus: Focus, shortBreak: Coffee, longBreak: Sparkles };
const today = () => localDayKey(Date.now());

function App() {
  const [data, setData] = useState<NexusData>(() => createInitialData());
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [focusMode, setFocusMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [taskInput, setTaskInput] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadData(webStorage).then((loaded) => { if (active) { setData(loaded); setReady(true); } })
      .catch((cause: unknown) => { console.error(cause); if (active) { setError("Could not load local data. Check browser storage permissions."); setReady(true); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let working = data;
    const advance = () => {
      const result = advanceTimer(working.timer, working.settings, Date.now());
      if (result.completions.length) {
        const newSessions = result.completions.filter((item) => item.mode === "focus").map((item) => ({
          id: crypto.randomUUID(), mode: item.mode, startedAt: item.startedAt, completedAt: item.completedAt,
          durationMs: item.durationMs, taskId: working.selectedTaskId
        } satisfies FocusSession));
        working = {
          ...working,
          timer: result.state,
          sessions: [...working.sessions, ...newSessions].slice(-5000)
        };
        setData(working);
        void saveData(webStorage, working).catch((cause: unknown) => { console.error(cause); setError("Your timer advanced, but saving its session failed."); });
        showCompletion(newSessions.length > 0);
      }
    };
    advance();
    const timerId = window.setInterval(() => {
      const stamp = Date.now();
      setNow(stamp);
      advance();
    }, 1000);
    return () => window.clearInterval(timerId);
  }, [ready, data]);

  useEffect(() => {
    if (!ready) return;
    const handle = window.setTimeout(() => {
      void saveData(webStorage, data).catch((cause: unknown) => { console.error(cause); setError("Changes could not be saved to this device."); });
    }, 150);
    return () => window.clearTimeout(handle);
  }, [data, ready]);

  useEffect(() => {
    document.documentElement.dataset.theme = data.settings.theme === "system"
      ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
      : data.settings.theme;
    document.documentElement.dataset.accent = data.settings.accent;
  }, [data.settings.theme, data.settings.accent]);

  const timer = data.timer;
  const remaining = timer.phase === "running" && timer.endsAt !== null ? Math.max(0, timer.endsAt - Date.now()) : timer.remainingMs;
  const total = timer.durationMs;
  const progress = Math.max(0, Math.min(1, 1 - remaining / total));
  const ModeIcon = modeIcons[timer.mode];
  const todaySessions = useMemo(() => data.sessions.filter((session) => localDayKey(session.completedAt) === today()), [data.sessions, now]);
  const focusMinutes = Math.round(todaySessions.reduce((sum, item) => sum + item.durationMs, 0) / 60_000);
  const filteredTasks = data.tasks.filter((task) => task.title.toLowerCase().includes(query.toLowerCase()));
  const streak = useMemo(() => {
    const days = new Set(data.sessions.map((session) => localDayKey(session.completedAt)));
    let count = 0;
    let date = new Date();
    if (!days.has(localDayKey(date.getTime()))) date.setDate(date.getDate() - 1);
    while (days.has(localDayKey(date.getTime()))) { count += 1; date.setDate(date.getDate() - 1); }
    return count;
  }, [data.sessions]);

  const updateData = useCallback((updater: (value: NexusData) => NexusData) => setData((current) => updater(current)), []);
  function showCompletion(focusCompleted: boolean) {
    setNotice(focusCompleted ? "Focus session complete. Take a moment to reset." : "Break complete. Ready when you are.");
    if (data.settings.notifications && "Notification" in window && Notification.permission === "granted") {
      new Notification("Pomodoro Nexus", { body: focusCompleted ? "Focus session complete. Nice work." : "Break complete. Ready to focus?" });
    }
    if (data.settings.sound) {
      try {
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = focusCompleted ? 660 : 440;
        gain.gain.value = 0.07;
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.start(); oscillator.stop(context.currentTime + 0.18);
        oscillator.onended = () => { void context.close(); };
      } catch (cause) { console.warn("Sound playback is unavailable", cause); }
    }
    window.setTimeout(() => setNotice(""), 5000);
  }
  function commit(next: NexusData) { setData(next); }
  function timerAction(action: "toggle" | "reset" | "skip") {
    setNow(Date.now());
    updateData((current) => {
      const next = action === "toggle"
        ? current.timer.phase === "running" ? pauseTimer(current.timer) : startTimer(current.timer)
        : action === "reset" ? resetTimer(current.timer, current.settings) : skipTimer(current.timer, current.settings);
      return { ...current, timer: next };
    });
  }
  function chooseMode(mode: TimerMode) {
    updateData((current) => ({ ...current, timer: selectMode(current.timer, mode, current.settings) }));
  }
  function submitTask(event: FormEvent) {
    event.preventDefault();
    try {
      if (editId) {
        const currentTask = data.tasks.find((task) => task.id === editId);
        if (currentTask) commit({ ...data, tasks: data.tasks.map((task) => task.id === editId ? updateTask(currentTask, taskInput, priority) : task) });
        setEditId(null);
      } else {
        const task = createTask(taskInput, priority);
        commit({ ...data, tasks: [task, ...data.tasks] });
      }
      setTaskInput(""); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save task."); }
  }
  function toggle(task: Task) {
    const changed = toggleTask(task);
    commit({ ...data, tasks: data.tasks.map((item) => item.id === task.id ? changed : item) });
  }
  function selectTask(taskId: string | null) { commit({ ...data, selectedTaskId: data.selectedTaskId === taskId ? null : taskId }); }
  async function toggleNotifications() {
    if (!data.settings.notifications) {
      if (!("Notification" in window)) { setError("This browser does not support desktop notifications."); return; }
      if (Notification.permission === "default") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") { setError("Notification permission was not granted."); return; }
      } else if (Notification.permission !== "granted") { setError("Enable notifications for this site in browser settings first."); return; }
    }
    commit({ ...data, settings: { ...data.settings, notifications: !data.settings.notifications } });
  }
  function updateDuration(mode: TimerMode, value: string) {
    const minutes = Number(value);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) return;
    const settings = { ...data.settings, durations: { ...data.settings.durations, [mode]: minutes } };
    const nextTimer = timer.mode === mode && timer.phase !== "running" ? resetTimer(timer, settings) : timer;
    commit({ ...data, settings, timer: nextTimer });
  }
  function download(filename: string, content: string, mime: string) {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
    URL.revokeObjectURL(url);
  }
  async function importFile(file?: File) {
    if (!file) return;
    try { commit(await importData(webStorage, await file.text())); setNotice("Your data was imported."); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not import data."); }
  }
  async function clearData() {
    if (!confirm("Delete all Pomodoro Nexus data stored on this device? This cannot be undone.")) return;
    try { await deleteAllData(webStorage); setData(createInitialData()); setError(""); setNotice("Local data deleted."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete data."); }
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.code === "Space") { event.preventDefault(); timerAction("toggle"); }
      if (event.key.toLowerCase() === "r") timerAction("reset");
      if (event.key.toLowerCase() === "f") setFocusMode((value) => !value);
      if (event.key === "Escape") { setFocusMode(false); setSettingsOpen(false); setHistoryOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!ready) return <div className="loading"><div className="brand-mark">N</div><span>Preparing your focus space…</span></div>;
  const modeName = modeLabels[timer.mode];
  const hours = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setDate(date.getDate() - (6 - index));
    const key = localDayKey(date.getTime());
    const count = data.sessions.filter((item) => localDayKey(item.completedAt) === key).length;
    return { label: date.toLocaleDateString(undefined, { weekday: "short" }), count, today: key === today() };
  });

  return <main className={focusMode ? "app focus-only" : "app"}>
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <header className="topbar">
      <a className="brand" href="#" aria-label="Pomodoro Nexus home"><span className="brand-mark">N</span><span>POMODORO <b>NEXUS</b></span></a>
      <div className="top-actions">
        <div className="local-badge"><span /> LOCAL FIRST</div>
        <button className="icon-btn theme-toggle" aria-label="Toggle theme" onClick={() => commit({ ...data, settings: { ...data.settings, theme: data.settings.theme === "light" ? "dark" : "light" } })}>
          {data.settings.theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <button className="icon-btn" aria-label="Open settings" onClick={() => setSettingsOpen(true)}><Settings2 size={18} /></button>
      </div>
    </header>

    {notice && <div className="toast" role="status"><Check size={16} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15} /></button></div>}
    {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss"><X size={15} /></button></div>}

    <div className="dashboard">
      <section className="hero-panel panel">
        <div className="hero-head">
          <div><p className="eyebrow"><span className="eyebrow-dot" /> YOUR FOCUS SPACE</p><h1>Make room for <em>deep work.</em></h1></div>
          <button className="focus-toggle" onClick={() => setFocusMode(!focusMode)}><Focus size={16} /> {focusMode ? "Exit focus" : "Focus mode"}</button>
        </div>
        <div className="mode-tabs" role="tablist" aria-label="Timer mode">
          {(["focus", "shortBreak", "longBreak"] as const).map((mode) => {
            const Icon = modeIcons[mode];
            return <button role="tab" aria-selected={timer.mode === mode} className={timer.mode === mode ? "mode-tab active" : "mode-tab"} key={mode} onClick={() => chooseMode(mode)}><Icon size={15} />{modeLabels[mode]}</button>;
          })}
        </div>
        <div className="timer-layout">
          <div className={`timer-ring ${timer.phase === "running" ? "is-running" : ""}`} aria-label={`${modeName} timer ${formatTime(remaining)} remaining`}>
            <svg viewBox="0 0 300 300" aria-hidden="true">
              <circle className="ring-track" cx="150" cy="150" r="132" />
              <circle className="ring-progress" cx="150" cy="150" r="132" style={{ strokeDashoffset: `${Math.PI * 264 * (1 - progress)}` }} />
            </svg>
            <div className="ring-content"><span className="session-kicker"><ModeIcon size={14} /> {timer.phase === "running" ? "IN SESSION" : timer.phase === "paused" ? "PAUSED" : "READY WHEN YOU ARE"}</span><strong>{formatTime(remaining)}</strong><span className="ring-mode">{modeName}</span></div>
          </div>
          <div className="timer-side">
            <div className="session-note"><div className="note-icon"><Target size={19} /></div><div><span>SESSION</span><strong>{String(Math.max(1, timer.completedFocusSessions + 1)).padStart(2, "0")} <small>/ {data.settings.longBreakInterval} CYCLE</small></strong></div></div>
            <div className="timer-controls">
              <button className="primary-button" onClick={() => timerAction("toggle")}><span>{timer.phase === "running" ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}</span>{timer.phase === "running" ? "Pause session" : timer.phase === "paused" ? "Resume focus" : "Start focusing"}</button>
              <button className="control-icon" onClick={() => timerAction("reset")} aria-label="Reset timer"><RotateCcw size={17} /></button>
              <button className="control-icon" onClick={() => timerAction("skip")} aria-label="Skip session"><SkipForward size={17} /></button>
            </div>
            <p className="keyboard-hint">Press <kbd>SPACE</kbd> to {timer.phase === "running" ? "pause" : "start"} <span>·</span> <kbd>R</kbd> reset</p>
            <div className="linked-task"><span>FOCUSING ON</span><strong>{data.tasks.find((item) => item.id === data.selectedTaskId)?.title ?? "Choose a task to link"}</strong><ChevronDown size={15} /></div>
          </div>
        </div>
        <div className="hero-footer"><div><span className="footer-line" /> A little progress adds up.</div><span>STAY PRESENT <Sparkles size={13} /></span></div>
      </section>

      <aside className="stats-column">
        <article className="stat-card panel"><div className="stat-top"><span>DAILY FOCUS</span><div className="stat-icon cyan"><Clock3 size={17} /></div></div><strong>{focusMinutes}<small> min</small></strong><div className="stat-bottom"><span>Today’s focused time</span><span className="stat-trend">↗ {todaySessions.length} sessions</span></div></article>
        <article className="stat-card panel"><div className="stat-top"><span>SESSIONS TODAY</span><div className="stat-icon violet"><Activity size={17} /></div></div><strong>{todaySessions.length}<small> / {data.settings.dailyGoal}</small></strong><div className="goal-track"><span style={{ width: `${Math.min(100, todaySessions.length / data.settings.dailyGoal * 100)}%` }} /></div><div className="stat-bottom"><span>Daily goal progress</span><span>{Math.round(Math.min(100, todaySessions.length / data.settings.dailyGoal * 100))}%</span></div></article>
        <article className="stat-card panel"><div className="stat-top"><span>FOCUS STREAK</span><div className="stat-icon amber">✳</div></div><strong>{streak}<small> {streak === 1 ? "day" : "days"}</small></strong><div className="stat-bottom"><span>Keep your momentum</span><span className="flame">✦</span></div></article>
        <article className="week-card panel"><div className="week-heading"><div><span>YOUR RHYTHM</span><h2>This week</h2></div><button className="text-button" onClick={() => setHistoryOpen(true)}>Details <BarChart3 size={14} /></button></div><div className="week-chart">{hours.map((day) => <div className="chart-col" key={day.label}><div className="chart-track"><span className={day.today ? "chart-bar today" : "chart-bar"} style={{ height: `${Math.max(4, Math.min(100, day.count / Math.max(1, ...hours.map((item) => item.count)) * 100))}%` }} /></div><span className={day.today ? "today-label" : ""}>{day.label}</span></div>)}</div><div className="week-foot"><span><i /> Focus sessions</span><strong>{data.sessions.filter((item) => item.completedAt > Date.now() - 7 * 86400000).length} total</strong></div></article>
      </aside>

      <section className="tasks-panel panel">
        <div className="section-heading"><div className="heading-icon"><ListTodo size={17} /></div><div><h2>Today’s priorities</h2><p>Small steps, meaningful progress.</p></div><span className="task-count">{data.tasks.filter((task) => !task.completed).length} OPEN</span></div>
        <form className="task-form" onSubmit={submitTask}><label className="sr-only" htmlFor="task-title">Add a task</label><input id="task-title" value={taskInput} onChange={(event) => setTaskInput(event.target.value)} placeholder="What would you like to focus on?" maxLength={120} /><select aria-label="Task priority" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select><button type="submit" className="add-task" aria-label={editId ? "Save task" : "Add task"}><Plus size={17} /></button></form>
        <div className="task-tools"><div className="search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a task…" aria-label="Search tasks" /></div><span>{data.tasks.filter((item) => item.completed).length} completed</span></div>
        <div className="task-list">
          {filteredTasks.length === 0 ? <div className="empty-state"><div><ListTodo size={20} /></div><strong>{query ? "No matching tasks" : "Your task list is clear"}</strong><span>{query ? "Try another search." : "Add one priority to make your next session count."}</span></div> : filteredTasks.map((task) => <div className={`task-row ${task.completed ? "completed" : ""} ${data.selectedTaskId === task.id ? "selected" : ""}`} key={task.id}>
            <button className="task-check" onClick={() => toggle(task)} aria-label={task.completed ? "Mark incomplete" : "Mark complete"}>{task.completed && <Check size={13} />}</button>
            <button className="task-select" onClick={() => selectTask(task.id)} title="Link this task to your focus session">{task.title}</button><span className={`priority ${task.priority}`}>{task.priority}</span>
            <button className="task-more" aria-label={`Edit ${task.title}`} onClick={() => { setEditId(task.id); setTaskInput(task.title); setPriority(task.priority); document.getElementById("task-title")?.focus(); }}><MoreHorizontal size={17} /></button>
            <button className="task-more" aria-label={`Delete ${task.title}`} onClick={() => commit({ ...data, tasks: deleteTask(data.tasks, task.id), selectedTaskId: data.selectedTaskId === task.id ? null : data.selectedTaskId })}><Trash2 size={15} /></button>
          </div>)}
        </div>
        <div className="tasks-footer"><span><span className="selection-dot" /> Click a task to link it to your session</span><button className="text-button" onClick={() => setHistoryOpen(true)}>Session history <History size={14} /></button></div>
      </section>
    </div>
    <footer className="site-footer"><span><span className="brand-mini">N</span> A quiet place to do your best work.</span><button onClick={() => setSettingsOpen(true)}><CircleHelp size={14} /> Your data stays on this device</button></footer>

    {settingsOpen && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}><section className="dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="dialog-head"><div><span className="eyebrow">PERSONALIZE YOUR SPACE</span><h2 id="settings-title">Settings</h2></div><button className="icon-btn" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><X size={19} /></button></div>
      <div className="settings-scroll"><div className="settings-group"><h3>Timer lengths</h3><div className="duration-grid">{(["focus", "shortBreak", "longBreak"] as const).map((mode) => <label key={mode}>{modeLabels[mode]}<div><input aria-label={`${modeLabels[mode]} minutes`} type="number" min="1" max="180" value={data.settings.durations[mode]} onChange={(event) => updateDuration(mode, event.target.value)} /><span>min</span></div></label>)}</div><label className="setting-row">Long break every <input type="number" min="1" max="12" value={data.settings.longBreakInterval} onChange={(event) => commit({ ...data, settings: { ...data.settings, longBreakInterval: Math.max(1, Math.min(12, Number(event.target.value))) } })} /> focus sessions</label></div>
        <div className="settings-group"><h3>Daily goal & appearance</h3><label className="setting-row">Focus sessions per day <input type="number" min="1" max="50" value={data.settings.dailyGoal} onChange={(event) => commit({ ...data, settings: { ...data.settings, dailyGoal: Math.max(1, Math.min(50, Number(event.target.value))) } })} /></label><label className="setting-row">Theme<select value={data.settings.theme} onChange={(event) => commit({ ...data, settings: { ...data.settings, theme: event.target.value as NexusData["settings"]["theme"] } })}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></label><div className="accent-picker"><span>Accent color</span>{(["cyan", "violet", "mint", "amber"] as const).map((accent) => <button key={accent} className={`accent-swatch ${accent} ${data.settings.accent === accent ? "chosen" : ""}`} onClick={() => commit({ ...data, settings: { ...data.settings, accent } })} aria-label={`${accent} accent`} aria-pressed={data.settings.accent === accent} />)}</div></div>
        <div className="settings-group"><h3>Alerts</h3><label className="setting-row">Desktop notifications<button className={`switch ${data.settings.notifications ? "on" : ""}`} role="switch" aria-checked={data.settings.notifications} onClick={() => void toggleNotifications()}><span /></button></label><label className="setting-row">Soft completion sound<button className={`switch ${data.settings.sound ? "on" : ""}`} role="switch" aria-checked={data.settings.sound} onClick={() => commit({ ...data, settings: { ...data.settings, sound: !data.settings.sound } })}><span /></button></label></div>
        <div className="settings-group"><h3>Your data</h3><p className="privacy-copy">Your tasks, settings, and sessions are stored only in this browser using IndexedDB. Nothing is sent to a server.</p><div className="data-actions"><button onClick={() => void exportData(webStorage).then((content) => download("pomodoro-nexus-backup.json", content, "application/json")).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Export failed."))}><ArrowDownToLine size={15} /> Export JSON</button><label><Upload size={15} /> Import JSON<input type="file" accept="application/json,.json" onChange={(event) => void importFile(event.target.files?.[0])} /></label><button className="danger-action" onClick={() => void clearData()}><Trash2 size={15} /> Delete all data</button></div></div>
      </div><div className="dialog-footer"><button className="primary-button compact" onClick={() => setSettingsOpen(false)}>Done</button></div>
    </section></div>}

    {historyOpen && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistoryOpen(false); }}><section className="dialog history-dialog" role="dialog" aria-modal="true" aria-labelledby="history-title"><div className="dialog-head"><div><span className="eyebrow">YOUR FOCUS TRAIL</span><h2 id="history-title">Session history</h2></div><button className="icon-btn" onClick={() => setHistoryOpen(false)} aria-label="Close history"><X size={19} /></button></div><div className="history-search"><Search size={15} /><input aria-label="Search session history" placeholder="Search linked task…" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="history-list">{data.sessions.filter((session) => (data.tasks.find((task) => task.id === session.taskId)?.title ?? "").toLowerCase().includes(query.toLowerCase())).slice().reverse().map((session) => <div className="history-row" key={session.id}><div className="history-mark"><Focus size={15} /></div><div><strong>{data.tasks.find((task) => task.id === session.taskId)?.title ?? "Focused session"}</strong><span>{new Date(session.completedAt).toLocaleString()}</span></div><span>{Math.round(session.durationMs / 60_000)} min</span></div>)}{data.sessions.length === 0 && <div className="empty-state"><div><History size={20} /></div><strong>No completed focus sessions yet</strong><span>Finish a focus timer to start your history.</span></div>}</div><div className="dialog-footer"><button className="text-button" onClick={() => download("pomodoro-nexus-sessions.csv", ["mode,startedAt,completedAt,durationMinutes,task", ...data.sessions.map((session) => `${session.mode},${new Date(session.startedAt).toISOString()},${new Date(session.completedAt).toISOString()},${Math.round(session.durationMs / 60000)},"${(data.tasks.find((task) => task.id === session.taskId)?.title ?? "").replaceAll("\"", "\"\"")}"`)].join("\n"), "text/csv")}>Export CSV <ArrowDownToLine size={14} /></button><button className="primary-button compact" onClick={() => setHistoryOpen(false)}>Close</button></div></section></div>}
  </main>;
}

export default App;
