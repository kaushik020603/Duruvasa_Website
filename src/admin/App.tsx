import { useCallback, useEffect, useState } from "react";
import { entities } from "../../shared/schema";
import { api, ApiError, setCsrf } from "./api";
import { AuthCtx, Login, Setup, type User } from "./auth";
import { go, href, useLoc } from "./router";
import { ConfirmProvider, Loading, ToastProvider } from "./ui";
import { ContentPage } from "./pages/content";
import { EnquiriesPage, SubscribersPage } from "./pages/inbox";
import { MediaPage } from "./pages/media";
import { AuditPage, BackupsPage, Dashboard, SecurityPage, UsersPage } from "./pages/system";

const GROUPS: { title: string; keys: string[] }[] = [
  { title: "Pages", keys: ["site", "hero", "about", "sections"] },
  { title: "Content", keys: ["services", "offerings", "advantages", "attributes", "posts", "legal"] },
  { title: "Trust", keys: ["partners", "team", "testimonials", "badges"] },
  { title: "Resources", keys: ["resources"] },
];

function Nav({ user, newCount, active, onNavigate }: { user: User; newCount: number; active: string; onNavigate: () => void }) {
  const link = (path: string, label: string, icon: string, badge?: number) => {
    const on = active === path || (path !== "/" && active.startsWith(path + "/"));
    return (
      <a key={path} href={href(path)} className={on ? "on" : ""} aria-current={on ? "page" : undefined} onClick={onNavigate}>
        <span className="ico" aria-hidden="true">{icon}</span>{label}{!!badge && <span className="badge">{badge}</span>}
      </a>
    );
  };
  return (
    <nav aria-label="Admin">
      {link("/", "Dashboard", "◧")}
      <h6>Inbox</h6>
      {link("/enquiries", "Enquiries", "✉", newCount)}
      {link("/subscribers", "Subscribers", "☰")}
      {GROUPS.map((g) => (
        <div key={g.title}>
          <h6>{g.title}</h6>
          {g.keys.map((k) => { const e = entities.find((x) => x.key === k)!; return link(`/content/${k}`, e.label, e.icon); })}
        </div>
      ))}
      <h6>Library</h6>
      {link("/media", "Media", "🖼")}
      <h6>Account</h6>
      {link("/security", "My security", "🔐")}
      {user.role === "admin" && link("/users", "Team access", "👥")}
      {user.role === "admin" && link("/backups", "Backups", "💾")}
      {link("/audit", "Activity log", "📜")}
    </nav>
  );
}

function Frame({ user, onSignOut, refresh }: { user: User; onSignOut: () => void; refresh: () => Promise<void> }) {
  const loc = useLoc();
  const [menu, setMenu] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const path = "/" + loc.parts.join("/");

  useEffect(() => {
    const poll = () => api<{ enquiries: { new: number } }>("GET", "/stats").then((s) => setNewCount(s.enquiries.new)).catch(() => {});
    poll();
    const t = setInterval(poll, 60_000);
    return () => clearInterval(t);
  }, [loc.parts[0]]);

  useEffect(() => { window.scrollTo(0, 0); document.title = "DuRuVaSa Admin"; }, [path]);

  const [section, ...rest] = loc.parts;
  let page: React.ReactNode;
  switch (section) {
    case undefined: page = <Dashboard />; break;
    case "content": page = <ContentPage parts={rest} />; break;
    case "enquiries": page = <EnquiriesPage loc={loc} />; break;
    case "subscribers": page = <SubscribersPage />; break;
    case "media": page = <MediaPage />; break;
    case "security": page = <SecurityPage />; break;
    case "users": page = user.role === "admin" ? <UsersPage /> : <NoAccess />; break;
    case "backups": page = user.role === "admin" ? <BackupsPage /> : <NoAccess />; break;
    case "audit": page = <AuditPage />; break;
    default: page = <div className="empty"><h3>Page not found</h3><p><a href={href("/")}>Back to the dashboard</a></p></div>;
  }

  return (
    <AuthCtx.Provider value={{ user, refresh, signOut: async () => onSignOut() }}>
      <div className={`app${menu ? " menu-open" : ""}`}>
        <a className="skip" href="#main-content">Skip to content</a>
        <aside className="sidebar">
          <a className="brand" href={href("/")} onClick={() => setMenu(false)}><span className="shield" aria-hidden="true">🛡</span><div><b>DuRuVaSa</b><small>Admin</small></div></a>
          <Nav user={user} newCount={newCount} active={path} onNavigate={() => setMenu(false)} />
        </aside>
        {menu && <button className="scrim" aria-label="Close menu" onClick={() => setMenu(false)} />}
        <div className="main">
          <header className="topbar">
            <button className="icon-btn burger" aria-label="Open menu" onClick={() => setMenu(true)}>☰</button>
            <span className="grow" />
            <a className="btn sm" href="/" target="_blank" rel="noopener">View site ↗</a>
            <div className="usermenu">
              <span className="avatar" aria-hidden="true">{(user.name || user.email)[0].toUpperCase()}</span>
              <span className="who"><b>{user.name || user.email}</b><small>{user.role === "admin" ? "Administrator" : "Editor"}</small></span>
              <button className="btn sm" onClick={onSignOut}>Sign out</button>
            </div>
          </header>
          <main id="main-content" className="content" tabIndex={-1}>{page}</main>
        </div>
      </div>
    </AuthCtx.Provider>
  );
}

const NoAccess = () => <div className="empty"><h3>Administrator access required</h3><p>Ask an administrator if you need this.</p></div>;

type Auth = { status: "loading" } | { status: "out"; notice?: string } | { status: "in"; user: User };

export default function App() {
  const loc = useLoc();
  const [auth, setAuth] = useState<Auth>({ status: "loading" });

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ user: User; csrf: string }>("GET", "/auth/me", undefined, { silent401: true });
      setCsrf(r.csrf);
      setAuth({ status: "in", user: r.user });
    } catch (e) { setAuth({ status: "out", notice: e instanceof ApiError && e.status !== 401 ? e.message : undefined }); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const on = () => setAuth((a) => (a.status === "in" ? { status: "out", notice: "Your session ended. Please sign in again." } : a));
    window.addEventListener("admin:unauthorized", on);
    return () => window.removeEventListener("admin:unauthorized", on);
  }, []);

  const signedIn = (user: User, csrf: string) => { setCsrf(csrf); setAuth({ status: "in", user }); go("/"); };
  const signOut = async () => { try { await api("POST", "/auth/logout"); } catch { /* already out */ } setCsrf(""); setAuth({ status: "out" }); go("/"); };

  return (
    <ToastProvider>
      <ConfirmProvider>
        {auth.status === "loading" ? <div className="boot"><Loading label="Loading admin…" /></div>
          : auth.status === "out" ? (loc.parts[0] === "setup" ? <Setup loc={loc} onSignedIn={signedIn} /> : <Login onSignedIn={signedIn} notice={auth.notice} />)
          : <Frame user={auth.user} onSignOut={signOut} refresh={refresh} />}
      </ConfirmProvider>
    </ToastProvider>
  );
}
