import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "tr4ck-state-v1";
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
      entries: [
        { id: makeId(), date: new Date().toISOString().slice(0, 10), hours: 4.5 },
      ],
    },
  ],
};

const getInitialState = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return defaultState;
  }
  try {
    const parsed = JSON.parse(stored);
    if (!parsed?.profile || !Array.isArray(parsed?.projects)) {
      return defaultState;
    }
    return parsed;
  } catch (error) {
    return defaultState;
  }
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
        const earned = hours * Number(profile.rate || 0);
        return [
          project.name,
          entry.date,
          hours.toFixed(2),
          Number(profile.rate || 0).toFixed(2),
          earned.toFixed(2),
        ];
      })
    ),
  ];

  return rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
};

const downloadCsv = (csv) => {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "tr4ck-export.csv";
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

export default function App() {
  const [state, setState] = useState(getInitialState);
  const [activeProjectId, setActiveProjectId] = useState(
    state.projects[0]?.id || null
  );
  const [view, setView] = useState("rows");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!state.projects.find((project) => project.id === activeProjectId)) {
      setActiveProjectId(state.projects[0]?.id || null);
    }
  }, [state.projects, activeProjectId]);

  const activeProject = useMemo(
    () => state.projects.find((project) => project.id === activeProjectId),
    [state.projects, activeProjectId]
  );

  const totals = useMemo(() => {
    const totalHours = state.projects.reduce(
      (sum, project) => sum + sumHours(project.entries),
      0
    );
    const earned = totalHours * Number(state.profile.rate || 0);
    return { totalHours, earned };
  }, [state.projects, state.profile.rate]);

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
    downloadCsv(buildCsv(state));
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">
          <span className="logo-mark">Tr4ck</span>
          <span className="logo-sub">Minimal time tracker</span>
        </div>
        <div className="topbar-actions">
          <button className="btn ghost" type="button" onClick={handleExport}>
            Export CSV
          </button>
          <button className="btn" type="button" onClick={addProject}>
            New project
          </button>
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
            <span>Hourly rate (CAD)</span>
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
          <div>
            <p className="eyebrow">Total hours</p>
            <h2>{formatHours(totals.totalHours)}</h2>
          </div>
          <div>
            <p className="eyebrow">Total earned</p>
            <h2>{currencyFormatter.format(totals.earned)}</h2>
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
            {state.projects.map((project) => {
              const hours = sumHours(project.entries);
              const earned = hours * Number(state.profile.rate || 0);
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
                  <span className="chevron">›</span>
                </button>
              );
            })}
          </div>
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
                    {formatHours(sumHours(activeProject.entries))} hrs ·{" "}
                    {currencyFormatter.format(
                      sumHours(activeProject.entries) *
                        Number(state.profile.rate || 0)
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
                    onClick={() => removeProject(activeProject.id)}
                  >
                    Delete project
                  </button>
                </div>
              </div>

              <div className="tabs">
                <button
                  type="button"
                  className={`tab${view === "rows" ? " active" : ""}`}
                  onClick={() => setView("rows")}
                >
                  Rows
                </button>
                <button
                  type="button"
                  className={`tab${view === "calendar" ? " active" : ""}`}
                  onClick={() => setView("calendar")}
                >
                  Calendar
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
                        Number(state.profile.rate || 0);
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
                  rate={Number(state.profile.rate || 0)}
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
    </div>
  );
}

function CalendarView({ entries, rate }) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const days = getMonthDays(viewDate);
  const monthLabel = viewDate.toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
  });

  const entryByDate = entries.reduce((accumulator, entry) => {
    accumulator[entry.date] = Number(entry.hours || 0);
    return accumulator;
  }, {});

  const goToMonth = (offset) => {
    setViewDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1)
    );
  };

  return (
    <div className="calendar">
      <div className="calendar-header">
        <h4>{monthLabel}</h4>
        <div className="calendar-actions">
          <button className="icon-button" type="button" onClick={() => goToMonth(-1)}>
            ‹
          </button>
          <button className="icon-button" type="button" onClick={() => goToMonth(1)}>
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
        {days.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className="calendar-cell muted" />;
          }
          const dateKey = date.toISOString().slice(0, 10);
          const hours = entryByDate[dateKey];
          return (
            <div key={dateKey} className="calendar-cell">
              <span className="calendar-date">{date.getDate()}</span>
              {hours ? (
                <div className="calendar-hours">
                  <span>{formatHours(hours)}h</span>
                  <span>{currencyFormatter.format(hours * rate)}</span>
                </div>
              ) : (
                <span className="calendar-empty">—</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
