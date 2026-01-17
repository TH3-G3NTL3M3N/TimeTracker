import { useEffect, useMemo, useRef, useState } from "react";

const AUTH_KEY = "tr4ck-auth-v1";
const AUTH_LOCK_KEY = "tr4ck-auth-lock-v1";
const currencyFormatter = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 2,
});

const makeId = () =>
  `proj_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;

const defaultState = {
  profile: {
    name: "",
    rate: 85,
  },
  projects: [
    {
      id: makeId(),
      name: "Atlas redesign",
      rate: 85,
      archived: false,
      entries: [
        { id: makeId(), date: new Date().toISOString().slice(0, 10), hours: 4.5 },
      ],
    },
  ],
};

const normalizeState = (value) => {
  if (!value?.profile || !Array.isArray(value?.projects)) {
    return defaultState;
  }
  const normalizedProjects = value.projects.map((project) => ({
    ...project,
    rate: project.rate ?? value.profile.rate ?? 0,
    archived: Boolean(project.archived),
    entries: Array.isArray(project.entries) ? project.entries : [],
  }));
  return { ...value, projects: normalizedProjects };
};

const getInitialAuth = () => {
  const stored = localStorage.getItem(AUTH_KEY);
  return stored === "true";
};

const sumHours = (entries) =>
  entries.reduce((total, entry) => total + Number(entry.hours || 0), 0);

const formatHours = (value) =>
  Number.isFinite(value) ? value.toFixed(1).replace(/\.0$/, "") : "0";

const buildCsv = ({ profile, projects }) => {
  const rows = [
    ["Project", "Date", "Hours", "Rate", "Earned"],
    ...projects.flatMap((project) =>
      project.entries.map((entry) => {
        const hours = Number(entry.hours || 0);
        const projectRate = Number(project.rate ?? profile.rate ?? 0);
        const earned = hours * projectRate;
        return [
          project.name,
          entry.date,
          hours.toFixed(2),
          projectRate.toFixed(2),
          earned.toFixed(2),
        ];
      })
    ),
  ];

  return rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
};

const downloadCsv = (csv, filename = "tr4ck-export.csv") => {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const getMonthDays = (date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = [];
  for (let i = 0; i < startWeekday; i += 1) {
    days.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(new Date(year, month, day));
  }
  return days;
};

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const toLocalDateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

export default function App() {
  const expectedUser = import.meta.env.VITE_LOGIN_USER || "";
  const expectedPass = import.meta.env.VITE_LOGIN_PASS || "";
  const authRequired = Boolean(expectedUser || expectedPass);
  const [isAuthed, setIsAuthed] = useState(() =>
    authRequired ? getInitialAuth() : true
  );
  const [state, setState] = useState(() => normalizeState(defaultState));
  const [isLoadingState, setIsLoadingState] = useState(true);
  const [stateError, setStateError] = useState("");
  const saveTimeoutRef = useRef(null);
  const hasLoadedRef = useRef(false);
  const [activeProjectId, setActiveProjectId] = useState(
    state.projects[0]?.id || null
  );
  const [view, setView] = useState("calendar");
  const [summaryRange, setSummaryRange] = useState("all");
  const [exportOpen, setExportOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmProject, setConfirmProject] = useState(null);
  const [exportProjectIds, setExportProjectIds] = useState(
    () => new Set(state.projects.map((project) => project.id))
  );
  const [exportRange, setExportRange] = useState({ start: "", end: "" });

  const { rangeStart, rangeEnd } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (summaryRange === "today") {
      return { rangeStart: today, rangeEnd: today };
    }
    if (summaryRange === "week") {
      const dayOfWeek = today.getDay();
      const daysSinceMonday = (dayOfWeek + 6) % 7;
      const start = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - daysSinceMonday
      );
      const end = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + 6
      );
      return { rangeStart: start, rangeEnd: end };
    }
    return { rangeStart: null, rangeEnd: null };
  }, [summaryRange]);

  const isInRange = (dateString) => {
    if (!rangeStart || !rangeEnd) {
      return true;
    }
    const entryDate = new Date(`${dateString}T00:00:00`);
    return entryDate >= rangeStart && entryDate <= rangeEnd;
  };

  const getProjectRate = (project) =>
    Number(project?.rate ?? state.profile.rate ?? 0);

  const getProjectHours = (entries) =>
    entries.reduce((total, entry) => {
      if (!isInRange(entry.date)) {
        return total;
      }
      return total + Number(entry.hours || 0);
    }, 0);

  useEffect(() => {
    localStorage.setItem(AUTH_KEY, isAuthed ? "true" : "false");
  }, [isAuthed]);

  useEffect(() => {
    if (!isAuthed) {
      return;
    }
    let isActive = true;
    const loadState = async () => {
      setIsLoadingState(true);
      setStateError("");
      try {
        const response = await fetch("/api/state");
        if (!response.ok) {
          throw new Error("Failed to load state.");
        }
        const payload = await response.json();
        if (payload?.state) {
          setState(normalizeState(payload.state));
        }
        if (isActive) {
          hasLoadedRef.current = true;
        }
      } catch (error) {
        if (isActive) {
          setStateError("Storage unavailable. Working locally.");
        }
      } finally {
        if (isActive) {
          setIsLoadingState(false);
        }
      }
    };
    loadState();
    return () => {
      isActive = false;
    };
  }, [isAuthed]);

  useEffect(() => {
    if (!isAuthed || !hasLoadedRef.current) {
      return;
    }
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state }),
        });
        setStateError("");
      } catch (error) {
        setStateError("Failed to sync. Changes will retry.");
      }
    }, 500);
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [state, isAuthed]);

  useEffect(() => {
    const activeProjects = state.projects.filter((project) => !project.archived);
    if (!activeProjects.find((project) => project.id === activeProjectId)) {
      setActiveProjectId(activeProjects[0]?.id || null);
    }
  }, [state.projects, activeProjectId]);

  useEffect(() => {
    setExportProjectIds(new Set(state.projects.map((project) => project.id)));
  }, [state.projects]);

  const activeProjects = useMemo(
    () => state.projects.filter((project) => !project.archived),
    [state.projects]
  );
  const archivedProjects = useMemo(
    () => state.projects.filter((project) => project.archived),
    [state.projects]
  );
  const activeProject = useMemo(
    () => activeProjects.find((project) => project.id === activeProjectId),
    [activeProjects, activeProjectId]
  );

  const syncMessage = stateError || (isLoadingState ? "Loading storage..." : "");

  const totals = useMemo(() => {
    const totalHours = activeProjects.reduce(
      (sum, project) => sum + getProjectHours(project.entries),
      0
    );
    const earned = activeProjects.reduce(
      (sum, project) =>
        sum + getProjectHours(project.entries) * getProjectRate(project),
      0
    );
    const projectCount = activeProjects.reduce((count, project) => {
      return getProjectHours(project.entries) > 0 ? count + 1 : count;
    }, 0);
    return { totalHours, earned, projectCount };
  }, [activeProjects, state.profile.rate, rangeStart, rangeEnd]);

  const updateProfile = (updates) => {
    setState((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        ...updates,
      },
    }));
  };

  const updateProject = (projectId, updates) => {
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((project) =>
        project.id === projectId ? { ...project, ...updates } : project
      ),
    }));
  };

  const addProject = () => {
    const newProject = {
      id: makeId(),
      name: "Untitled project",
      rate: state.profile.rate,
      archived: false,
      entries: [],
    };
    setState((prev) => ({
      ...prev,
      projects: [...prev.projects, newProject],
    }));
    setActiveProjectId(newProject.id);
  };

  const removeProject = (projectId) => {
    setState((prev) => ({
      ...prev,
      projects: prev.projects.filter((project) => project.id !== projectId),
    }));
  };

  const archiveProject = (projectId) => {
    updateProject(projectId, { archived: true });
  };

  const restoreProject = (projectId) => {
    updateProject(projectId, { archived: false });
  };

  const confirmRemoveProject = (project) => {
    if (!project) {
      return;
    }
    setConfirmProject(project);
    setConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    if (confirmProject) {
      removeProject(confirmProject.id);
    }
    setConfirmProject(null);
    setConfirmOpen(false);
  };

  const addEntry = (projectId) => {
    const newEntry = {
      id: makeId(),
      date: new Date().toISOString().slice(0, 10),
      hours: 1,
    };
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((project) =>
        project.id === projectId
          ? { ...project, entries: [...project.entries, newEntry] }
          : project
      ),
    }));
  };

  const updateEntry = (projectId, entryId, updates) => {
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              entries: project.entries.map((entry) =>
                entry.id === entryId ? { ...entry, ...updates } : entry
              ),
            }
          : project
      ),
    }));
  };

  const setEntryHours = (projectId, date, hoursValue) => {
    const nextHours = Number(hoursValue);
    if (!Number.isFinite(nextHours)) {
      return;
    }
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((project) => {
        if (project.id !== projectId) {
          return project;
        }
        const existing = project.entries.find((entry) => entry.date === date);
        if (existing) {
          if (nextHours <= 0) {
            return {
              ...project,
              entries: project.entries.filter((entry) => entry.id !== existing.id),
            };
          }
          return {
            ...project,
            entries: project.entries.map((entry) =>
              entry.id === existing.id ? { ...entry, hours: nextHours } : entry
            ),
          };
        }
        if (nextHours <= 0) {
          return project;
        }
        const newEntry = { id: makeId(), date, hours: nextHours };
        return { ...project, entries: [...project.entries, newEntry] };
      }),
    }));
  };

  const removeEntry = (projectId, entryId) => {
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              entries: project.entries.filter((entry) => entry.id !== entryId),
            }
          : project
      ),
    }));
  };

  const handleExport = () => {
    setExportProjectIds(new Set(state.projects.map((project) => project.id)));
    setExportRange({ start: "", end: "" });
    setExportOpen(true);
  };

  const applyExport = () => {
    const filteredProjects = state.projects
      .filter((project) => exportProjectIds.has(project.id))
      .map((project) => {
        const entries = project.entries.filter((entry) => {
          if (!exportRange.start && !exportRange.end) {
            return true;
          }
          const entryDate = entry.date;
          if (exportRange.start && entryDate < exportRange.start) {
            return false;
          }
          if (exportRange.end && entryDate > exportRange.end) {
            return false;
          }
          return true;
        });
        return { ...project, entries };
      })
      .filter((project) => project.entries.length > 0);
    const rangeLabel =
      exportRange.start || exportRange.end
        ? `${exportRange.start || "start"}_to_${exportRange.end || "today"}`
        : "all-time";
    const filename = `tr4ck-export_${rangeLabel}.csv`;
    downloadCsv(buildCsv({ profile: state.profile, projects: filteredProjects }), filename);
    setExportOpen(false);
  };

  const setExportPreset = (preset) => {
    const today = toLocalDateKey(new Date());
    if (preset === "all") {
      setExportRange({ start: "", end: "" });
      return;
    }
    if (preset === "today") {
      setExportRange({ start: today, end: today });
      return;
    }
    if (preset === "week") {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const daysSinceMonday = (dayOfWeek + 6) % 7;
      const start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - daysSinceMonday
      );
      const end = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + 6
      );
      setExportRange({ start: toLocalDateKey(start), end: toLocalDateKey(end) });
    }
  };

  if (!isAuthed) {
    return (
      <LoginScreen
        expectedUser={expectedUser}
        expectedPass={expectedPass}
        onSuccess={() => setIsAuthed(true)}
      />
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">
          <span className="logo-mark">TR4CK</span>
          <span className="logo-sub">Minimal time tracker</span>
        </div>
        <div className="topbar-actions">
          {syncMessage ? (
            <span className={`sync-status${stateError ? " alert" : ""}`}>
              {syncMessage}
            </span>
          ) : null}
          <button className="btn ghost" type="button" onClick={handleExport}>
            Export CSV
          </button>
          {authRequired ? (
            <button
              className="btn ghost"
              type="button"
              onClick={() => setIsAuthed(false)}
            >
              Log out
            </button>
          ) : null}
        </div>
      </header>

      <section className="summary">
        <div className="summary-card">
          <label>
            <span>Client name</span>
            <input
              type="text"
              placeholder="Your name"
              value={state.profile.name}
              onChange={(event) => updateProfile({ name: event.target.value })}
            />
          </label>
          <label>
            <span>Default hourly rate (CAD)</span>
            <div className="input-prefix">
              <span>$</span>
              <input
                type="number"
                min="0"
                step="1"
                value={state.profile.rate}
                onChange={(event) =>
                  updateProfile({ rate: Number(event.target.value) })
                }
              />
            </div>
          </label>
        </div>
        <div className="summary-card highlight">
          <div className="summary-card-header">
            <p className="summary-range-label">Totals</p>
            <div className="summary-range">
              <select
                value={summaryRange}
                onChange={(event) => setSummaryRange(event.target.value)}
              >
                <option value="all">All time</option>
                <option value="week">This week</option>
                <option value="today">Today</option>
              </select>
            </div>
          </div>
          <div className="summary-metrics">
            <div>
              <p className="eyebrow">Total hours</p>
              <h2>{formatHours(totals.totalHours)}</h2>
            </div>
            <div>
              <p className="eyebrow">Total earned</p>
              <h2>{currencyFormatter.format(totals.earned)}</h2>
            </div>
            <div>
              <p className="eyebrow">Projects</p>
              <h2>{totals.projectCount}</h2>
            </div>
          </div>
        </div>
      </section>

      <section className="workspace">
        <aside className="projects">
          <div className="section-header">
            <h3>Projects</h3>
            <button className="btn small" type="button" onClick={addProject}>
              Add
            </button>
          </div>
          <div className="project-list">
            {activeProjects.map((project) => {
              const hours = getProjectHours(project.entries);
              const projectRate = getProjectRate(project);
              const earned = hours * projectRate;
              return (
                <button
                  key={project.id}
                  type="button"
                  className={`project-row${
                    project.id === activeProjectId ? " active" : ""
                  }`}
                  onClick={() => setActiveProjectId(project.id)}
                >
                  <div>
                    <p className="project-name">{project.name}</p>
                    <p className="project-meta">
                      {formatHours(hours)} hrs · {currencyFormatter.format(earned)}
                    </p>
                  </div>
                  <div className="project-actions">
                    <div
                      className="project-rate"
                      onClick={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                    >
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={projectRate}
                        onChange={(event) =>
                          updateProject(project.id, {
                            rate: Number(event.target.value),
                          })
                        }
                      />
                      <span>$/hr</span>
                    </div>
                    <span className="chevron">›</span>
                  </div>
                </button>
              );
            })}
          </div>
          <button
            className="archived-toggle"
            type="button"
            onClick={() => setArchivedOpen(true)}
          >
            Archived ({archivedProjects.length})
          </button>
        </aside>

        <main className="project-detail">
          {activeProject ? (
            <>
              <div className="detail-header">
                <div>
                  <input
                    className="project-title"
                    value={activeProject.name}
                    onChange={(event) =>
                      updateProject(activeProject.id, {
                        name: event.target.value,
                      })
                    }
                  />
                  <p className="project-meta">
                    {formatHours(getProjectHours(activeProject.entries))} hrs ·{" "}
                    {currencyFormatter.format(
                      getProjectHours(activeProject.entries) *
                        getProjectRate(activeProject)
                    )}
                  </p>
                </div>
                <div className="detail-actions">
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => addEntry(activeProject.id)}
                  >
                    Add entry
                  </button>
                  <button
                    className="btn ghost danger"
                    type="button"
                    onClick={() => archiveProject(activeProject.id)}
                  >
                    Archive project
                  </button>
                </div>
              </div>

              <div className="tabs">
                <button
                  type="button"
                  className={`tab${view === "calendar" ? " active" : ""}`}
                  onClick={() => setView("calendar")}
                >
                  Calendar
                </button>
                <button
                  type="button"
                  className={`tab${view === "rows" ? " active" : ""}`}
                  onClick={() => setView("rows")}
                >
                  Rows
                </button>
              </div>

              {view === "rows" ? (
                <div className="entries">
                  <div className="entries-header">
                    <span>Date</span>
                    <span>Hours</span>
                    <span>Earned</span>
                    <span></span>
                  </div>
                  {activeProject.entries.length === 0 ? (
                    <div className="empty-state">
                      <p>No entries yet.</p>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => addEntry(activeProject.id)}
                      >
                        Create first entry
                      </button>
                    </div>
                  ) : (
                    activeProject.entries.map((entry) => {
                      const earned =
                        Number(entry.hours || 0) *
                        getProjectRate(activeProject);
                      return (
                        <div className="entry-row" key={entry.id}>
                          <input
                            type="date"
                            value={entry.date}
                            onChange={(event) =>
                              updateEntry(activeProject.id, entry.id, {
                                date: event.target.value,
                              })
                            }
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.25"
                            value={entry.hours}
                            onChange={(event) =>
                              updateEntry(activeProject.id, entry.id, {
                                hours: Number(event.target.value),
                              })
                            }
                          />
                          <span>{currencyFormatter.format(earned)}</span>
                          <button
                            className="icon-button"
                            type="button"
                            onClick={() =>
                              removeEntry(activeProject.id, entry.id)
                            }
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                <CalendarView
                  entries={activeProject.entries}
                  rate={getProjectRate(activeProject)}
                  onSetHours={(date, hours) =>
                    setEntryHours(activeProject.id, date, hours)
                  }
                />
              )}
            </>
          ) : (
            <div className="empty-state">
              <p>Create a project to get started.</p>
              <button className="btn" type="button" onClick={addProject}>
                New project
              </button>
            </div>
          )}
        </main>
      </section>

      {exportOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal">
            <div className="modal-header">
              <div>
                <p className="modal-title">Export CSV</p>
                <p className="modal-subtitle">Choose projects and date range.</p>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setExportOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-section">
                <div className="modal-section-header">
                  <h4>Projects</h4>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() =>
                      setExportProjectIds(
                        new Set(state.projects.map((project) => project.id))
                      )
                    }
                  >
                    Select all
                  </button>
                </div>
                <div className="modal-projects">
                  {state.projects.map((project) => (
                    <label key={project.id} className="modal-checkbox">
                      <input
                        type="checkbox"
                        checked={exportProjectIds.has(project.id)}
                        onChange={(event) => {
                          setExportProjectIds((prev) => {
                            const next = new Set(prev);
                            if (event.target.checked) {
                              next.add(project.id);
                            } else {
                              next.delete(project.id);
                            }
                            return next;
                          });
                        }}
                      />
                      <span>{project.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="modal-section">
                <div className="modal-section-header">
                  <h4>Date range</h4>
                  <div className="modal-pills">
                    <button
                      className="pill"
                      type="button"
                      onClick={() => setExportPreset("all")}
                    >
                      All
                    </button>
                    <button
                      className="pill"
                      type="button"
                      onClick={() => setExportPreset("week")}
                    >
                      This week
                    </button>
                    <button
                      className="pill"
                      type="button"
                      onClick={() => setExportPreset("today")}
                    >
                      Today
                    </button>
                  </div>
                </div>
                <div className="modal-range">
                  <label>
                    <span>Start</span>
                    <input
                      type="date"
                      value={exportRange.start}
                      onChange={(event) =>
                        setExportRange((prev) => ({
                          ...prev,
                          start: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>End</span>
                    <input
                      type="date"
                      value={exportRange.end}
                      onChange={(event) =>
                        setExportRange((prev) => ({
                          ...prev,
                          end: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn ghost"
                type="button"
                onClick={() => setExportOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn"
                type="button"
                onClick={applyExport}
                disabled={exportProjectIds.size === 0}
              >
                Download CSV
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {archivedOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal">
            <div className="modal-header">
              <div>
                <p className="modal-title">Archived projects</p>
                <p className="modal-subtitle">Manage or delete archived work.</p>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setArchivedOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              {archivedProjects.length === 0 ? (
                <p className="archived-empty">No archived projects yet.</p>
              ) : (
                <div className="archived-list">
                  {archivedProjects.map((project) => (
                    <div key={project.id} className="archived-row">
                      <div>
                        <p className="archived-name">{project.name}</p>
                        <p className="project-meta">
                          {formatHours(getProjectHours(project.entries))} hrs ·{" "}
                          {currencyFormatter.format(
                            getProjectHours(project.entries) * getProjectRate(project)
                          )}
                        </p>
                      </div>
                      <div className="archived-actions">
                        <button
                          className="btn ghost small"
                          type="button"
                          onClick={() => restoreProject(project.id)}
                        >
                          Restore
                        </button>
                        <button
                          className="btn ghost danger small"
                          type="button"
                          onClick={() => confirmRemoveProject(project)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="btn ghost"
                type="button"
                onClick={() => setArchivedOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal confirm-modal">
            <div className="modal-header">
              <div>
                <p className="modal-title">Delete project?</p>
                <p className="modal-subtitle">
                  {confirmProject
                    ? `This will remove "${confirmProject.name}" and all entries.`
                    : "This will remove the project and all entries."}
                </p>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setConfirmOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-footer">
              <button
                className="btn ghost"
                type="button"
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>
              <button className="btn danger" type="button" onClick={handleConfirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LoginScreen({ expectedUser, expectedPass, onSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [lockUntil, setLockUntil] = useState(() => {
    const stored = localStorage.getItem(AUTH_LOCK_KEY);
    return stored ? Number(stored) : 0;
  });
  const [tick, setTick] = useState(0);
  const failedAttemptsRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((prev) => prev + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = (event) => {
    event.preventDefault();
    const now = Date.now();
    if (lockUntil && now < lockUntil) {
      setError("Too many attempts. Try again shortly.");
      return;
    }
    const userOk = expectedUser ? username === expectedUser : true;
    const passOk = expectedPass ? password === expectedPass : true;
    if (userOk && passOk) {
      failedAttemptsRef.current = 0;
      localStorage.removeItem(AUTH_LOCK_KEY);
      onSuccess();
      return;
    }
    failedAttemptsRef.current += 1;
    if (failedAttemptsRef.current >= 5) {
      const nextLock = now + 30 * 1000;
      setLockUntil(nextLock);
      localStorage.setItem(AUTH_LOCK_KEY, String(nextLock));
      failedAttemptsRef.current = 0;
      setError("Too many attempts. Try again shortly.");
      return;
    }
    setError("Invalid credentials. Try again.");
  };

  const remainingSeconds =
    lockUntil && Date.now() < lockUntil
      ? Math.ceil((lockUntil - Date.now()) / 1000)
      : 0;

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-header">
          <p className="login-title">TR4CK</p>
          <p className="login-subtitle">Sign in to continue.</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            <span>Username</span>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={remainingSeconds > 0}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={remainingSeconds > 0}
            />
          </label>
          {error ? <p className="login-error">{error}</p> : null}
          {remainingSeconds > 0 ? (
            <p className="login-lock">
              Try again in {remainingSeconds}s.
            </p>
          ) : null}
          <button className="btn" type="submit">
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}

function CalendarView({ entries, rate, onSetHours }) {
  const [mode, setMode] = useState("week");
  const [viewDate, setViewDate] = useState(new Date());
  const today = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }, []);
  const [editingDate, setEditingDate] = useState(null);
  const [draftHours, setDraftHours] = useState("");
  const days = getMonthDays(viewDate);

  const getWeekStart = (date) => {
    const dayOfWeek = date.getDay();
    const daysSinceMonday = (dayOfWeek + 6) % 7;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysSinceMonday);
  };

  const weekStart = getWeekStart(viewDate);
  const weekDaysList = Array.from({ length: 7 }, (_, index) => {
    return new Date(
      weekStart.getFullYear(),
      weekStart.getMonth(),
      weekStart.getDate() + index
    );
  });

  const monthLabel = viewDate.toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
  });
  const weekLabel = `${weekStart.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  })} - ${weekDaysList[6].toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;

  const entryByDate = entries.reduce((accumulator, entry) => {
    accumulator[entry.date] = Number(entry.hours || 0);
    return accumulator;
  }, {});

  const goToPrev = () => {
    setViewDate((prev) => {
      if (mode === "month") {
        return new Date(prev.getFullYear(), prev.getMonth() - 1, 1);
      }
      return new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 7);
    });
  };

  const goToNext = () => {
    setViewDate((prev) => {
      if (mode === "month") {
        return new Date(prev.getFullYear(), prev.getMonth() + 1, 1);
      }
      return new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 7);
    });
  };

  const handleSave = () => {
    if (!editingDate) {
      return;
    }
    const hoursValue = draftHours === "" ? 0 : Number(draftHours);
    onSetHours(editingDate, hoursValue);
    setEditingDate(null);
  };

  return (
    <div className="calendar">
      <div className="calendar-header">
        <div className="calendar-title">
          <div className="calendar-toggle">
            <button
              type="button"
              className={`calendar-toggle-btn${mode === "month" ? " active" : ""}`}
              onClick={() => setMode("month")}
            >
              Month
            </button>
            <button
              type="button"
              className={`calendar-toggle-btn${mode === "week" ? " active" : ""}`}
              onClick={() => setMode("week")}
            >
              Week
            </button>
          </div>
          <h4 className="calendar-range">{mode === "month" ? monthLabel : weekLabel}</h4>
        </div>
        <div className="calendar-actions">
          <button className="icon-button" type="button" onClick={goToPrev}>
            ‹
          </button>
          <button className="icon-button" type="button" onClick={goToNext}>
            ›
          </button>
        </div>
      </div>
      <div className="calendar-grid">
        {weekDays.map((day) => (
          <span key={day} className="calendar-day">
            {day}
          </span>
        ))}
        {(mode === "month" ? days : weekDaysList).map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className="calendar-cell muted" />;
          }
          const dateKey = toLocalDateKey(date);
          const hours = entryByDate[dateKey];
          const isToday = date.toDateString() === today.toDateString();
          const isEditing = editingDate === dateKey;
          return (
            <div
              key={dateKey}
              className={`calendar-cell${isToday ? " today" : ""}${
                isEditing ? " editing" : ""
              }`}
              onClick={() => {
                if (isEditing) {
                  return;
                }
                if (editingDate && editingDate !== dateKey) {
                  handleSave();
                }
                setEditingDate(dateKey);
                setDraftHours(hours ? String(hours) : "");
              }}
            >
              <span className="calendar-date">{date.getDate()}</span>
              {isEditing ? (
                <div
                  className="calendar-edit"
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    placeholder="0"
                    value={draftHours}
                    onChange={(event) => setDraftHours(event.target.value)}
                    onBlur={handleSave}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleSave();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setEditingDate(null);
                      }
                    }}
                    autoFocus
                  />
                  <span>hrs</span>
                </div>
              ) : hours ? (
                <div className="calendar-hours">
                  <span>{formatHours(hours)}h</span>
                  <span>{currencyFormatter.format(hours * rate)}</span>
                </div>
              ) : (
                <button className="calendar-add" type="button">
                  +
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
