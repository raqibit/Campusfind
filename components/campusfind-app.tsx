"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BatteryFull,
  Bell,
  Camera,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Headphones,
  Home,
  IdCard,
  ImagePlus,
  KeyRound,
  LockKeyhole,
  Mail,
  MapPin,
  PackageCheck,
  PackageOpen,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  User,
  WalletCards,
  Wifi,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  apiConfigured,
  listReports,
  listMyMatches,
  createClaim,
  uploadFile,
  listAdminClaims,
  getClaimEvidenceUrl,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  listUniversities,
  login,
  publishReport,
  readSession,
  register,
  removeSession,
  saveSession,
  type ApiReport,
  type ApiMatch,
  type ApiSession,
  type ApiUniversity,
} from "@/lib/api";
import { featuredMatch, seedNotifications, seedReports } from "@/lib/demo-data";
import type {
  ItemCategory,
  ItemReport,
  NotificationItem,
  ReportType,
  Screen,
} from "@/lib/types";

type EntryPhase = "splash" | "onboarding" | "app";
type AuthMode = "options" | "signin" | "signup";
type AuthReason = "post" | "claim" | "account";

const ONBOARDING_KEY = "campusfind_mobile_onboarding_v1";

const categories: { label: ItemCategory | "All"; icon: LucideIcon }[] = [
  { label: "All", icon: SlidersHorizontal },
  { label: "Identity card", icon: IdCard },
  { label: "Wallet", icon: WalletCards },
  { label: "Electronics", icon: Headphones },
  { label: "Bag", icon: PackageOpen },
  { label: "Keys", icon: KeyRound },
  { label: "Books", icon: BookOpen },
];

const onboardingSlides = [
  {
    image: "/campusfind-onboarding.png",
    kicker: "Campus recovery, reimagined",
    title: "Lost does not have to stay lost.",
    copy: "See what people have found around campus and report an item in a few thoughtful steps.",
  },
  {
    image: "/campusfind-essentials.png",
    kicker: "Smarter matching",
    title: "We connect the clues for you.",
    copy: "CampusFind compares images, descriptions, dates and nearby landmarks to surface likely matches.",
  },
  {
    image: "/campus-scene.png",
    kicker: "Private and human",
    title: "Prove ownership. Meet safely.",
    copy: "Sensitive details stay hidden while a verified reviewer guides each approved handover.",
  },
];

const topLevelScreens: Screen[] = ["home", "reports", "notifications", "profile"];

function Mark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? "app-mark compact" : "app-mark"} aria-hidden="true">
      <Search size={compact ? 17 : 23} strokeWidth={2.8} />
      <i />
    </span>
  );
}

function StatusBar() {
  return (
    <div className="phone-status" aria-hidden="true">
      <span>9:41</span>
      <span><Wifi size={14} /><BatteryFull size={17} /></span>
    </div>
  );
}

function demoSession(fullName = "Demo Student", email = "demo.student@example.edu"): ApiSession {
  return {
    token: "campusfind-demo-session",
    user: {
      id: "demo-user",
      fullName,
      email,
      matricNumber: "UI-DEMO-001",
      role: "student",
      verified: true,
      university: { id: "demo-ui", name: "University of Ibadan", shortName: "UI" },
    },
  };
}

function mapApiReport(report: ApiReport): ItemReport {
  return {
    id: report._id,
    type: report.type,
    title: report.title,
    category: report.category,
    description: report.publicDescription,
    location: report.location.label,
    date: new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(report.happenedAt)),
    reporter: report.reporter?.fullName || "CampusFind member",
    status: report.status,
    image: report.imageUrls?.[0],
    accent: report.type === "found" ? "#e6f7ee" : "#eaf0ff",
    initials: report.title.split(" ").slice(0, 2).map((word) => word[0]).join("").toUpperCase(),
  };
}

export default function CampusFindApp() {
  const [entry, setEntry] = useState<EntryPhase>("splash");
  const [slide, setSlide] = useState(0);
  const [screen, setScreen] = useState<Screen>("home");
  const [session, setSession] = useState<ApiSession | null>(null);
  const [reports, setReports] = useState(seedReports);
  const [matches, setMatches] = useState<ApiMatch[]>([]);
  const [notifications, setNotifications] = useState(seedNotifications);
  const [selectedReport, setSelectedReport] = useState(seedReports[2]);
  const [claimTarget, setClaimTarget] = useState<ItemReport>(seedReports[1]);
  const [reportType, setReportType] = useState<ReportType>("lost");
  const [authReason, setAuthReason] = useState<AuthReason | null>(null);
  const [protectedDestination, setProtectedDestination] = useState<Screen>("home");
  const [toast, setToast] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSession(readSession());
      setEntry(window.localStorage.getItem(ONBOARDING_KEY) ? "app" : "onboarding");
    }, 1150);
    return () => window.clearTimeout(timer);
  }, []);

  const sessionToken = session?.token;
  const universityId = session?.user.university.id;
  useEffect(() => {
    if (!apiConfigured || !sessionToken || sessionToken === "campusfind-demo-session" || !universityId) return;
    let active = true;
    void listReports(universityId).then((items) => {
      if (active) setReports(items.map(mapApiReport));
    }).catch(() => {
      // Preserve the current list when a background refresh fails.
    });
    void listMyMatches(sessionToken).then((items) => {
      if (active) setMatches(items);
    }).catch(() => {
      if (active) setMatches([]);
    });
    return () => { active = false; };
  }, [sessionToken, universityId]);

  const unread = notifications.filter((item) => !item.read).length;
  const primaryMatch = matches[0];
  const lostReport = primaryMatch ? mapApiReport(primaryMatch.lostReport) : reports.find((item) => item.id === featuredMatch.lostReportId) || reports[0];
  const foundReport = primaryMatch ? mapApiReport(primaryMatch.foundReport) : reports.find((item) => item.id === featuredMatch.foundReportId) || reports[1];

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  }

  function navigate(next: Screen) {
    setScreen(next);
    window.setTimeout(() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 0);
  }

  function finishOnboarding() {
    window.localStorage.setItem(ONBOARDING_KEY, "seen");
    setEntry("app");
  }

  function requireAccount(destination: Screen, reason: AuthReason) {
    if (session) {
      navigate(destination);
      return;
    }
    setProtectedDestination(destination);
    setAuthReason(reason);
  }

  async function completeAuthentication(nextSession: ApiSession) {
    saveSession(nextSession);
    setSession(nextSession);
    setAuthReason(null);
    navigate(protectedDestination);
    showToast(`Welcome, ${nextSession.user.fullName.split(" ")[0]}`);
  }

  function signOut() {
    removeSession();
    setSession(null);
    setReports(seedReports);
    setMatches([]);
    navigate("home");
    showToast("You are browsing as a guest");
  }

  function openReport(report: ItemReport) {
    setSelectedReport(report);
    navigate("detail");
  }

  async function addReport(report: ItemReport, happenedAt: string, imageFile?: File) {
    let savedReport = report;
    let message = "Demo report published locally";
    if (apiConfigured) {
      if (!session || session.token === "campusfind-demo-session") {
        showToast("Sign in with a real CampusFind account before publishing.");
        return;
      }
      try {
        const imageKeys = imageFile ? [await uploadFile(session.token, imageFile, "report-image")] : [];
        const result = await publishReport(session.token, {
          type: report.type, title: report.title, category: report.category,
          publicDescription: report.description, location: { label: report.location },
          happenedAt, imageUrls: [], imageKeys,
        });
        savedReport = mapApiReport(result.data);
        message = result.meta.matchesCreated
          ? `${result.meta.matchesCreated} possible match${result.meta.matchesCreated === 1 ? "" : "es"} found`
          : "Report saved; matching has started";
        setReports((items) => [savedReport, ...items.filter((item) => item.id !== savedReport.id)]);
      } catch (error) {
        showToast(error instanceof Error ? error.message : "The report could not be published. Please try again.");
        return;
      }
    } else {
      setReports((items) => [savedReport, ...items]);
      setNotifications((items) => [{
        id: `notice-${Date.now()}`, title: "Demo report published",
        message: `Demo mode is comparing ${report.title.toLowerCase()} with sample campus reports.`,
        time: "Just now", kind: "system", read: false,
      }, ...items]);
    }
    setSelectedReport(savedReport);
    showToast(message);
    navigate("detail");
  }

  async function submitClaim(privateDetail: string, proofFile?: File) {
    if (!apiConfigured) {
      showToast("Demo claim submitted for simulated review.");
      return "DEMO";
    }
    if (!session || session.token === "campusfind-demo-session") {
      throw new Error("Sign in with a real CampusFind account to submit a claim.");
    }
    const matches = await listMyMatches(session.token);
    const match = matches.find((candidate) => candidate.foundReport?._id === claimTarget.id && candidate.status !== "approved" && candidate.status !== "rejected");
    if (!match) throw new Error("No active match links this found item to one of your lost reports. Check your matches before submitting a claim.");
    const proofKeys = proofFile ? [await uploadFile(session.token, proofFile, "claim-evidence")] : [];
    const claim = await createClaim(session.token, { matchId: match._id, privateDetail, proofKeys });
    showToast("Claim submitted for private review.");
    return claim.id;
  }

  function replayOnboarding() {
    setSlide(0);
    setEntry("onboarding");
  }

  if (entry === "splash") return <SplashScreen />;
  if (entry === "onboarding") {
    return <OnboardingScreen slide={slide} setSlide={setSlide} onFinish={finishOnboarding} />;
  }

  return (
    <div className="phone-stage">
      <div className="mobile-app">
        <StatusBar />
        <div className="app-scroll" ref={scrollRef}>
          {screen === "home" && (
            <HomeView
              session={session}
              unread={unread}
              reports={reports}
              lostReport={lostReport}
              foundReport={foundReport}
              match={primaryMatch}
              demoMode={!apiConfigured}
              onOpenReport={openReport}
              onNavigate={navigate}
              onReport={(type) => {
                setReportType(type);
                requireAccount("create", "post");
              }}
              onAlerts={() => {
                setNotifications((items) => items.map((item) => ({ ...item, read: true })));
                navigate("notifications");
              }}
            />
          )}
          {screen === "reports" && <BrowseView reports={reports} onOpen={openReport} onBack={() => navigate("home")} />}
          {screen === "detail" && selectedReport && (
            <DetailView
              report={selectedReport}
              onBack={() => navigate("reports")}
              onClaim={() => { setClaimTarget(selectedReport); requireAccount("claim", "claim"); }}
            />
          )}
          {screen === "match" && lostReport && foundReport && (
            <MatchView lost={lostReport} found={foundReport} match={primaryMatch} onBack={() => navigate("home")} onClaim={() => { setClaimTarget(foundReport); requireAccount("claim", "claim"); }} />
          )}
          {screen === "create" && <CreateView initialType={reportType} onBack={() => navigate("home")} onPublish={addReport} />}
          {screen === "claim" && <ClaimView report={claimTarget} onBack={() => navigate("match")} onDone={() => navigate("notifications")} showToast={showToast} onSubmit={submitClaim} />}
          {screen === "notifications" && (
            <AlertsView notifications={notifications} setNotifications={setNotifications} session={session} onMatch={() => navigate("match")} onSignIn={() => {
              setProtectedDestination("notifications");
              setAuthReason("account");
            }} />
          )}
          {screen === "profile" && (
            <ProfileView
              session={session}
              onSignIn={() => {
                setProtectedDestination("profile");
                setAuthReason("account");
              }}
              onSignOut={signOut}
              onReplay={replayOnboarding}
              onAdmin={() => navigate("admin")}
            />
          )}
          {screen === "admin" && <AdminView onBack={() => navigate("profile")} session={session} />}
        </div>

        {topLevelScreens.includes(screen) && (
          <BottomNavigation
            screen={screen}
            onNavigate={navigate}
            onPost={() => requireAccount("create", "post")}
          />
        )}

        {authReason && (
          <AuthSheet
            reason={authReason}
            onClose={() => setAuthReason(null)}
            onAuthenticated={completeAuthentication}
          />
        )}

        {toast && <div className="app-toast"><CheckCircle2 size={17} />{toast}</div>}
      </div>
    </div>
  );
}

function SplashScreen() {
  return (
    <div className="entry-stage">
      <div className="entry-phone splash-screen">
        <div className="splash-orbit"><Mark /></div>
        <div><h1>CampusFind</h1><p>Recover what matters.</p></div>
        <span className="splash-loader"><i /></span>
      </div>
    </div>
  );
}

function OnboardingScreen({ slide, setSlide, onFinish }: { slide: number; setSlide: (slide: number) => void; onFinish: () => void }) {
  const pointerStart = useRef(0);
  const item = onboardingSlides[slide];
  const isLast = slide === onboardingSlides.length - 1;

  function endSwipe(x: number) {
    const distance = x - pointerStart.current;
    if (distance < -45 && slide < onboardingSlides.length - 1) setSlide(slide + 1);
    if (distance > 45 && slide > 0) setSlide(slide - 1);
  }

  return (
    <div className="entry-stage">
      <div className="entry-phone onboarding-screen" onPointerDown={(event) => { pointerStart.current = event.clientX; }} onPointerUp={(event) => endSwipe(event.clientX)}>
        <StatusBar />
        <button type="button" className="skip-button" onClick={onFinish}>Skip</button>
        <div className="onboarding-image" key={item.image}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.image} alt="CampusFind recovery experience" />
          <span className="onboarding-chip"><ShieldCheck size={15} /> University of Ibadan</span>
        </div>
        <div className="onboarding-copy" key={item.title}>
          <p className="micro-label">{item.kicker}</p>
          <h1>{item.title}</h1>
          <p>{item.copy}</p>
          <div className="onboarding-controls">
            <div className="page-dots" aria-label={`Slide ${slide + 1} of ${onboardingSlides.length}`}>
              {onboardingSlides.map((_, index) => <i key={index} className={index === slide ? "active" : ""} />)}
            </div>
            <button type="button" className="round-next" aria-label={isLast ? "Open CampusFind" : "Next slide"} onClick={() => isLast ? onFinish() : setSlide(slide + 1)}>
              {isLast ? <Check size={22} /> : <ArrowRight size={22} />}
            </button>
          </div>
          {isLast && <button type="button" className="enter-app-button" onClick={onFinish}>Explore CampusFind</button>}
        </div>
      </div>
    </div>
  );
}

function HomeView({
  session,
  unread,
  reports,
  lostReport,
  foundReport,
  match,
  demoMode,
  onOpenReport,
  onNavigate,
  onReport,
  onAlerts,
}: {
  session: ApiSession | null;
  unread: number;
  reports: ItemReport[];
  lostReport: ItemReport;
  foundReport: ItemReport;
  match: ApiMatch | undefined;
  demoMode: boolean;
  onOpenReport: (report: ItemReport) => void;
  onNavigate: (screen: Screen) => void;
  onReport: (type: ReportType) => void;
  onAlerts: () => void;
}) {
  const firstName = session?.user.fullName.split(" ")[0];
  return (
    <main className="mobile-page home-page">
      <header className="home-header">
        <div className="home-identity">
          {session ? <span className="mini-avatar">{session.user.fullName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span> : <Mark compact />}
          <span><small>{firstName ? `Welcome back, ${firstName}` : "Browse as a guest"}</small><button type="button">University of Ibadan <ChevronDown size={13} /></button></span>
        </div>
        <button className="round-icon" type="button" aria-label="Notifications" onClick={onAlerts}><Bell size={19} />{unread > 0 && <i />}</button>
      </header>

      <section className="home-intro">
        <p className="micro-label">A safer campus lost & found</p>
        <h1>Find what<br />went missing.</h1>
        <button className="home-search" type="button" onClick={() => onNavigate("reports")}><Search size={19} /><span>Search items or campus places</span></button>
      </section>

      <section className="quick-actions">
        <button type="button" className="lost-action" onClick={() => onReport("lost")}><span><PackageOpen size={22} /></span><b>Lost something?</b><small>Start a report</small><ArrowRight size={17} /></button>
        <button type="button" className="found-action" onClick={() => onReport("found")}><span><PackageCheck size={22} /></span><b>Found an item?</b><small>Help return it</small><ArrowRight size={17} /></button>
      </section>

      <section className="mobile-section">
        <div className="section-title"><div><p className="micro-label">Latest nearby</p><h2>Recently found</h2></div><button type="button" onClick={() => onNavigate("reports")}>See all</button></div>
        <div className="horizontal-items">
          {reports.filter((report) => report.type === "found").slice(0, 4).map((report) => <MiniReportCard key={report.id} report={report} onClick={() => onOpenReport(report)} />)}
        </div>
      </section>

      {(match || demoMode) && <section className="match-preview" onClick={() => onNavigate("match")}>
        <div className="match-preview-top"><span><Sparkles size={15} /> Smart match</span><strong>{match?.score ?? featuredMatch.score}%</strong></div>
        <h2>{match ? `These reports may describe the same ${foundReport.category.toLowerCase()}.` : "These sample reports may describe the same wallet."}</h2>
        <div className="match-thumbnails"><ReportThumb report={lostReport} /><i /><ReportThumb report={foundReport} /></div>
        <button type="button">Review match <ArrowRight size={16} /></button>
      </section>}

      <section className="trust-note"><ShieldCheck size={20} /><div><strong>Private by default</strong><p>Contact details and ownership proof stay hidden until a claim is reviewed.</p></div></section>
    </main>
  );
}

function MiniReportCard({ report, onClick }: { report: ItemReport; onClick: () => void }) {
  return (
    <button className="mini-report-card" type="button" onClick={onClick}>
      <ReportImage report={report} />
      <span className={`report-kind ${report.type}`}>{report.type}</span>
      <h3>{report.title}</h3>
      <p><MapPin size={12} />{report.location}</p>
    </button>
  );
}

function ReportThumb({ report }: { report: ItemReport }) {
  return <span className="report-thumb"><ReportImage report={report} /><small>{report.type}</small></span>;
}

function ReportImage({ report }: { report: ItemReport }) {
  if (report.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={report.image} alt={report.title} />;
  }
  return <span className="report-placeholder" style={{ background: report.accent }}>{report.initials}</span>;
}

function BrowseView({ reports, onOpen, onBack }: { reports: ItemReport[]; onOpen: (report: ItemReport) => void; onBack: () => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ItemCategory | "All">("All");
  const [type, setType] = useState<ReportType | "all">("all");
  const filtered = useMemo(() => reports.filter((report) => {
    const terms = `${report.title} ${report.location} ${report.category}`.toLowerCase();
    return (type === "all" || report.type === type) && (category === "All" || report.category === category) && terms.includes(query.toLowerCase());
  }), [reports, type, category, query]);

  return (
    <main className="mobile-page browse-page">
      <CompactHeader title="Browse items" onBack={onBack} />
      <div className="browse-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Wallet, ID card, library…" />{query && <button type="button" onClick={() => setQuery("")}><X size={15} /></button>}</div>
      <div className="type-tabs">{(["all", "found", "lost"] as const).map((item) => <button type="button" key={item} className={type === item ? "active" : ""} onClick={() => setType(item)}>{item}</button>)}</div>
      <div className="category-strip">{categories.map(({ label, icon: Icon }) => <button type="button" key={label} className={category === label ? "active" : ""} onClick={() => setCategory(label)}><Icon size={16} /><span>{label}</span></button>)}</div>
      <div className="result-count"><strong>{filtered.length} items</strong><span>Newest nearby</span></div>
      <div className="masonry-grid">{filtered.map((report, index) => <BrowseCard key={report.id} report={report} tall={index % 3 === 0} onClick={() => onOpen(report)} />)}</div>
      {!filtered.length && <div className="mobile-empty"><Search size={25} /><h3>No item found</h3><p>Try a different keyword or category.</p></div>}
    </main>
  );
}

function BrowseCard({ report, tall, onClick }: { report: ItemReport; tall: boolean; onClick: () => void }) {
  return <button type="button" className={`browse-card ${tall ? "tall" : ""}`} onClick={onClick}><div className="browse-card-image"><ReportImage report={report} /><span className={`report-kind ${report.type}`}>{report.type}</span></div><h3>{report.title}</h3><p><MapPin size={11} />{report.location}</p><small>{report.date}</small></button>;
}

function CompactHeader({ title, onBack, action }: { title: string; onBack: () => void; action?: React.ReactNode }) {
  return <header className="compact-header"><button className="round-icon" type="button" onClick={onBack} aria-label="Go back"><ArrowLeft size={19} /></button><h1>{title}</h1>{action || <span className="header-spacer" />}</header>;
}

function DetailView({ report, onBack, onClaim }: { report: ItemReport; onBack: () => void; onClaim: () => void }) {
  return (
    <main className="mobile-page detail-page">
      <div className="detail-hero">
        <ReportImage report={report} />
        <button type="button" className="overlay-back" onClick={onBack}><ArrowLeft size={19} /></button>
        <button type="button" className="overlay-save" aria-label="Save report"><BadgeCheck size={19} /></button>
        <div className="detail-fade" />
      </div>
      <section className="detail-content">
        <div className="detail-labels"><span className={`report-kind ${report.type}`}>{report.type}</span><span>{report.category}</span><span>{report.status}</span></div>
        <h1>{report.title}</h1>
        <div className="detail-meta"><span><MapPin size={15} /><b>{report.location}</b></span><span><Clock3 size={15} /><b>{report.date}</b></span></div>
        <div className="reporter-row"><span className="mini-avatar">{report.reporter.split(" ").map((word) => word[0]).slice(0, 2).join("")}</span><span><small>Reported by</small><strong>{report.reporter}</strong></span><BadgeCheck size={18} /></div>
        <article className="detail-description"><h2>What we know</h2><p>{report.description}</p></article>
        <article className="safety-card"><ShieldCheck size={21} /><div><strong>Keep private details private</strong><p>Use a unique hidden feature to prove ownership. Never share a PIN or bank information.</p></div></article>
      </section>
      {report.type === "found" && <div className="sticky-action"><button type="button" className="primary-app-button" onClick={onClaim}><LockKeyhole size={18} />Claim this item</button></div>}
    </main>
  );
}

function MatchView({ lost, found, match, onBack, onClaim }: { lost: ItemReport; found: ItemReport; match?: ApiMatch; onBack: () => void; onClaim: () => void }) {
  const factors = [
    ["Image", match?.factors.image ?? featuredMatch.factors.image],
    ["Description", match?.factors.text ?? featuredMatch.factors.text],
    ["Details", match?.factors.attributes ?? featuredMatch.factors.attributes],
    ["Location", match?.factors.location ?? featuredMatch.factors.location],
    ["Date", match?.factors.date ?? featuredMatch.factors.date],
  ] as const;
  const score = match?.score ?? featuredMatch.score;
  return (
    <main className="mobile-page match-page">
      <CompactHeader title="Possible match" onBack={onBack} />
      <section className="match-score-card"><span><Sparkles size={20} /></span><div><p className="micro-label">Good news</p><h1>{score}% match</h1><p>{match ? "This score is based on the reports saved in CampusFind." : "Two sample reports share several strong clues."}</p></div></section>
      <div className="match-pair"><article><div><ReportImage report={lost} /></div><small>Your lost report</small><h3>{lost.title}</h3><p><MapPin size={12} />{lost.location}</p></article><span className="match-connector"><Sparkles size={17} /></span><article><div><ReportImage report={found} /></div><small>Found nearby</small><h3>{found.title}</h3><p><MapPin size={12} />{found.location}</p></article></div>
      <section className="factor-card"><div className="section-title"><div><p className="micro-label">Transparent matching</p><h2>Why it matched</h2></div></div>{factors.map(([label, value]) => <div className="factor-row" key={label}><span><b>{label}</b><em>{value}%</em></span><div><i style={{ width: `${value}%` }} /></div></div>)}<p>Scores help discovery; they do not prove ownership.</p></section>
      <section className="match-next"><ShieldCheck size={21} /><div><strong>Ready to verify?</strong><p>Tell us one private detail that only the real owner should know.</p></div></section>
      <div className="inline-actions"><button type="button" className="primary-app-button" onClick={onClaim}>This is mine <ArrowRight size={18} /></button><button type="button" className="secondary-app-button" onClick={onBack}>Not my item</button></div>
    </main>
  );
}

function CreateView({ initialType, onBack, onPublish }: { initialType: ReportType; onBack: () => void; onPublish: (report: ItemReport, happenedAt: string, imageFile?: File) => Promise<void> }) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [imageFile, setImageFile] = useState<File | undefined>();
  const [draft, setDraft] = useState({ type: initialType, title: "", category: "" as ItemCategory | "", description: "", location: "", date: "" });

  function next() {
    if (step === 1 || (draft.title && draft.category && draft.location && draft.date)) setStep((value) => Math.min(3, value + 1));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    const report: ItemReport = {
      id: `report-${Date.now()}`,
      type: draft.type,
      title: draft.title,
      category: draft.category || "Other",
      description: draft.description,
      location: draft.location,
      date: new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(draft.date)),
      reporter: "Demo Student",
      status: "open",
      accent: draft.type === "found" ? "#e6f7ee" : "#eaf0ff",
      initials: draft.title.split(" ").slice(0, 2).map((word) => word[0]).join("").toUpperCase(),
    };
    await onPublish(report, new Date(draft.date).toISOString(), imageFile);
    setSubmitting(false);
  }

  return (
    <main className="mobile-page create-page">
      <CompactHeader title="New report" onBack={step > 1 ? () => setStep(step - 1) : onBack} action={<button className="draft-link" type="button">Save draft</button>} />
      <div className="step-progress"><span>Step {step} of 3</span><div>{[1, 2, 3].map((item) => <i key={item} className={item <= step ? "active" : ""} />)}</div></div>
      <form onSubmit={submit}>
        {step === 1 && <section className="create-step"><p className="micro-label">Let us start</p><h1>What happened?</h1><p className="step-copy">Choose the report type. You can still change it before publishing.</p><div className="report-choice"><button type="button" className={draft.type === "lost" ? "active" : ""} onClick={() => setDraft({ ...draft, type: "lost" })}><span><PackageOpen size={25} /></span><b>I lost an item</b><small>Help me find it</small><CheckCircle2 size={18} /></button><button type="button" className={draft.type === "found" ? "active found" : ""} onClick={() => setDraft({ ...draft, type: "found" })}><span><PackageCheck size={25} /></span><b>I found an item</b><small>Help return it</small><CheckCircle2 size={18} /></button></div></section>}
        {step === 2 && <section className="create-step"><p className="micro-label">Useful clues</p><h1>Describe the item.</h1><p className="step-copy">Clear public details give the matching system better evidence.</p><div className="mobile-form"><label><span>Item name</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Black leather wallet" required /></label><label><span>Category</span><select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as ItemCategory })} required><option value="">Choose category</option>{categories.filter((item) => item.label !== "All").map((item) => <option key={item.label}>{item.label}</option>)}</select></label><label><span>{draft.type === "lost" ? "Last seen" : "Found at"}</span><div className="input-icon"><MapPin size={17} /><input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="Kenneth Dike Library" required /></div></label><label><span>Date</span><input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} required /></label><label><span>Public description</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={4} placeholder="Colour, size, brand and visible features…" required /></label></div></section>}
        {step === 3 && <section className="create-step"><p className="micro-label">Final touch</p><h1>Add a clear photo.</h1><p className="step-copy">A useful photo can improve a visual match. Keep identity numbers out of view.</p><label className="mobile-upload"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImageFile(event.target.files?.[0] || undefined)} /><span><ImagePlus size={25} /></span><b>{imageFile?.name || "Choose a photo from your phone"}</b><small>{imageFile ? "Photo selected · uploads securely when published" : "JPG, PNG or WEBP · up to 8 MB · optional"}</small></label><div className="publish-summary"><span className={`report-kind ${draft.type}`}>{draft.type}</span><h3>{draft.title}</h3><p><MapPin size={13} />{draft.location}</p><small>{draft.category} · {draft.date}</small></div><div className="privacy-line"><ShieldCheck size={18} /><p>Your name and contact details will not appear in the public report.</p></div></section>}
        <div className="create-footer">{step < 3 ? <button type="button" className="primary-app-button" onClick={next}>Continue <ArrowRight size={18} /></button> : <button type="submit" className="primary-app-button" disabled={submitting}>{submitting ? "Publishing…" : "Publish report"}<ArrowRight size={18} /></button>}</div>
      </form>
    </main>
  );
}

function ClaimView({ report, onBack, onDone, showToast, onSubmit }: { report: ItemReport; onBack: () => void; onDone: () => void; showToast: (message: string) => void; onSubmit: (privateDetail: string, proofFile?: File) => Promise<string> }) {
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [privateDetail, setPrivateDetail] = useState("");
  const [proofFile, setProofFile] = useState<File | undefined>();
  const [claimReference, setClaimReference] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const reference = await onSubmit(privateDetail.trim(), proofFile);
      setClaimReference(reference);
      setDone(true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "The claim could not be submitted. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }
  if (done) return <main className="mobile-page claim-success"><span><CheckCircle2 size={39} /></span><p className="micro-label">Claim received</p><h1>We will review the details privately.</h1><p>You will receive an alert before any finder or handover information is released.</p><div><small>{claimReference === "DEMO" ? "Mode" : "Claim reference"}</small><strong>{claimReference === "DEMO" ? "Demo only" : claimReference}</strong></div><button type="button" className="primary-app-button" onClick={onDone}>View updates</button></main>;
  return <main className="mobile-page claim-page"><CompactHeader title="Verify ownership" onBack={onBack} /><section className="claim-item"><div><ReportImage report={report} /></div><span><small>You are claiming</small><strong>{report.title}</strong><p><MapPin size={12} />{report.location}</p></span></section><form onSubmit={submit}><div className="claim-intro"><span><LockKeyhole size={20} /></span><div><h1>Tell us something only the owner would know.</h1><p>This answer is sent privately for review and is never shown in the public report.</p></div></div><label className="claim-question"><span>Private identifying detail</span><textarea rows={5} value={privateDetail} onChange={(event) => setPrivateDetail(event.target.value)} minLength={10} maxLength={1500} required placeholder="For example: a name inside, a unique scratch or something kept in the item…" /><small>Never enter a password, card PIN or bank information.</small></label><label className="claim-proof"><Camera size={20} /><span><b>{proofFile?.name || "Add supporting proof"}</b><small>Old photo or receipt · optional</small></span><Plus size={17} /><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setProofFile(event.target.files?.[0] || undefined)} /></label><label className="claim-check"><input type="checkbox" required /><span>I confirm that this item belongs to me and the information is truthful.</span></label><button className="primary-app-button" type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Send for review"} <ArrowRight size={18} /></button></form></main>;
}
function AlertsView({ notifications, setNotifications, session, onMatch, onSignIn }: { notifications: NotificationItem[]; setNotifications: (update: (items: NotificationItem[]) => NotificationItem[]) => void; session: ApiSession | null; onMatch: () => void; onSignIn: () => void }) {
  const sessionToken = session?.token;
  useEffect(() => {
    if (!apiConfigured || !sessionToken || sessionToken === "campusfind-demo-session") return;
    let active = true;
    void listNotifications(sessionToken).then((items) => {
      if (!active) return;
      setNotifications(() => items.map((item) => ({
        id: item._id,
        title: item.title,
        message: item.message,
        time: new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt)),
        kind: item.kind === "match" || item.kind === "claim" ? item.kind : "system",
        read: Boolean(item.readAt),
      })));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [sessionToken, setNotifications]);
  if (!session) return <main className="mobile-page alerts-page"><SimpleTitle title="Alerts" /><div className="guest-state"><span><Bell size={26} /></span><h1>Matches should find you.</h1><p>Sign in to receive possible-match, claim-review and handover alerts.</p><button type="button" className="primary-app-button" onClick={onSignIn}>Sign in for alerts</button><small>You can continue browsing without an account.</small></div></main>;
  async function openNotification(item: NotificationItem) {
    setNotifications((items) => items.map((notice) => notice.id === item.id ? { ...notice, read: true } : notice));
    if (apiConfigured && session && session.token !== "campusfind-demo-session" && item.id.length > 20) {
      try { await markNotificationRead(session.token, item.id); } catch { /* Keep the local read state; refresh can reconcile it. */ }
    }
    if (item.kind === "match") onMatch();
  }
  async function markAllRead() {
    setNotifications((items) => items.map((item) => ({ ...item, read: true })));
    if (apiConfigured && session && session.token !== "campusfind-demo-session") {
      try { await markAllNotificationsRead(session.token); } catch { /* The next refresh will reconcile server state. */ }
    }
  }
  return <main className="mobile-page alerts-page"><SimpleTitle title="Alerts" /><div className="today-label">Your updates <button type="button" onClick={markAllRead}>Mark all read</button></div><div className="alert-list">{notifications.map((item) => <button type="button" key={item.id} className={!item.read ? "alert-card unread" : "alert-card"} onClick={() => void openNotification(item)}><span className={`alert-icon ${item.kind}`}>{item.kind === "match" ? <Sparkles size={19} /> : item.kind === "claim" ? <ShieldCheck size={19} /> : <Bell size={19} />}</span><span><strong>{item.title}</strong><p>{item.message}</p><small>{item.time}</small></span>{item.kind === "match" && <ChevronRight size={17} />}</button>)}</div></main>;
}

function ProfileView({ session, onSignIn, onSignOut, onReplay, onAdmin }: { session: ApiSession | null; onSignIn: () => void; onSignOut: () => void; onReplay: () => void; onAdmin: () => void }) {
  if (!session) return <main className="mobile-page profile-page"><SimpleTitle title="Account" /><section className="guest-profile"><div className="guest-portrait"><User size={30} /></div><p className="micro-label">Guest mode</p><h1>Browse freely.<br />Join when you need to act.</h1><p>Create an account only when you want to report or claim an item.</p><button type="button" className="primary-app-button" onClick={onSignIn}>Sign in or create account</button></section><SettingsList onReplay={onReplay} /></main>;
  return <main className="mobile-page profile-page"><SimpleTitle title="Account" /><section className="signed-profile"><span className="profile-avatar">{session.user.fullName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div><p className="micro-label">Verified student</p><h1>{session.user.fullName}</h1><p>{session.user.matricNumber} · University of Ibadan</p></div><BadgeCheck size={20} /></section><div className="profile-metrics"><div><strong>4</strong><span>Reports</span></div><div><strong>2</strong><span>Returned</span></div><div><strong>100%</strong><span>Safe record</span></div></div><section className="profile-options"><button type="button"><span><Bell size={18} /><span><b>Notification preferences</b><small>Matches, claims and handovers</small></span></span><ChevronRight size={17} /></button><button type="button"><span><ShieldCheck size={18} /><span><b>Privacy & verification</b><small>University identity and visibility</small></span></span><ChevronRight size={17} /></button>{session.user.role === "admin" && <button type="button" onClick={onAdmin}><span><BadgeCheck size={18} /><span><b>Review centre</b><small>Claims and safe handovers</small></span></span><ChevronRight size={17} /></button>}<button type="button" onClick={onReplay}><span><Sparkles size={18} /><span><b>Replay welcome tour</b><small>See how CampusFind works</small></span></span><ChevronRight size={17} /></button><button type="button"><span><CircleHelp size={18} /><span><b>Help & safety</b><small>Report rules and support</small></span></span><ChevronRight size={17} /></button></section><button className="sign-out-button" type="button" onClick={onSignOut}>Sign out</button></main>;
}

function SettingsList({ onReplay }: { onReplay: () => void }) {
  return <section className="profile-options guest-options"><button type="button" onClick={onReplay}><span><Sparkles size={18} /><span><b>Replay welcome tour</b><small>See how CampusFind works</small></span></span><ChevronRight size={17} /></button><button type="button"><span><CircleHelp size={18} /><span><b>Help & safety</b><small>Reporting and handover guidance</small></span></span><ChevronRight size={17} /></button></section>;
}

function AdminView({ onBack, session }: { onBack: () => void; session: ApiSession | null }) {
  const [claims, setClaims] = useState<import("@/lib/api").ApiAdminClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [evidenceUrls, setEvidenceUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!apiConfigured || !session || session.token === "campusfind-demo-session" || session.user.role !== "admin") return;
    let active = true;
    setLoading(true);
    void listAdminClaims(session.token).then((items) => { if (active) setClaims(items); }).catch((issue) => { if (active) setError(issue instanceof Error ? issue.message : "The review queue could not be loaded."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session?.token, session?.user.role]);
  async function revealEvidence(claimId: string, index: number) {
    if (!session) return;
    const key = `${claimId}:${index}`;
    setError("");
    try {
      const result = await getClaimEvidenceUrl(session.token, claimId, index);
      setEvidenceUrls((items) => ({ ...items, [key]: result.url }));
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Private evidence could not be opened.");
    }
  }
  return <main className="mobile-page admin-page"><CompactHeader title="Review centre" onBack={onBack} />
    {!apiConfigured ? <section className="guest-state"><span><ShieldCheck size={26} /></span><h1>Demo review centre</h1><p>Real claims and private evidence are available only when the API and administrator account are configured.</p></section> : session?.user.role !== "admin" || session.token === "campusfind-demo-session" ? <section className="guest-state"><span><LockKeyhole size={26} /></span><h1>Administrator access required</h1><p>Sign in with an authorised University of Ibadan administrator account to review claims and access private evidence.</p></section> : <><section className="admin-summary"><p className="micro-label">Authorised reviewers</p><h1>Ownership review queue</h1><div><span><strong>{claims.filter((claim) => claim.status === "pending").length}</strong><small>Pending</small></span><span><strong>{claims.filter((claim) => claim.status === "more_evidence").length}</strong><small>More evidence</small></span><span><strong>{claims.length}</strong><small>Total claims</small></span></div></section>
      {loading && <p className="step-copy">Loading claims…</p>}{error && <p role="alert" className="step-copy">{error}</p>}
      {!loading && claims.length === 0 && !error && <p className="step-copy">No claims are waiting for review.</p>}
      {claims.map((claim) => <article className="admin-claim" key={claim._id}><div><span className="mini-avatar">{(claim.claimant?.fullName || "CF").split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><span><small>Claim · {claim.status.replace("_", " ")}</small><strong>{claim.match?.foundReport?.title || claim.match?.lostReport?.title || "Campus item"}</strong><p>{claim.claimant?.fullName || "Claimant"} · {claim.match?.foundReport?.category || claim.match?.lostReport?.category || "Item"}</p><small>Private ownership detail</small><p>{claim.privateDetail}</p></span></div>
        {claim.evidenceCount > 0 && <div className="admin-evidence"><b>Supporting evidence ({claim.evidenceCount})</b>{Array.from({ length: claim.evidenceCount }, (_, index) => { const key = `${claim._id}:${index}`; return <span key={key}><button type="button" className="review-small" onClick={() => void revealEvidence(claim._id, index)}>Get secure evidence link {index + 1}</button>{evidenceUrls[key] && <a href={evidenceUrls[key]} target="_blank" rel="noreferrer">Open file (expires in 5 minutes)</a>}</span>; })}</div>}
        </article>)}</>}</main>;
}
function SimpleTitle({ title }: { title: string }) {
  return <header className="simple-title"><Mark compact /><h1>{title}</h1><span /></header>;
}

function BottomNavigation({ screen, onNavigate, onPost }: { screen: Screen; onNavigate: (screen: Screen) => void; onPost: () => void }) {
  const items: { screen: Screen; label: string; icon: LucideIcon }[] = [
    { screen: "home", label: "Home", icon: Home },
    { screen: "reports", label: "Browse", icon: Search },
    { screen: "notifications", label: "Alerts", icon: Bell },
    { screen: "profile", label: "Me", icon: User },
  ];
  return <nav className="app-bottom-nav"><div>{items.slice(0, 2).map(({ screen: target, label, icon: Icon }) => <button type="button" key={target} className={screen === target ? "active" : ""} onClick={() => onNavigate(target)}><Icon size={20} /><span>{label}</span></button>)}</div><button type="button" className="post-fab" onClick={onPost} aria-label="Post an item"><Plus size={24} /><span>Post</span></button><div>{items.slice(2).map(({ screen: target, label, icon: Icon }) => <button type="button" key={target} className={screen === target ? "active" : ""} onClick={() => onNavigate(target)}><Icon size={20} /><span>{label}</span></button>)}</div></nav>;
}

function AuthSheet({ reason, onClose, onAuthenticated }: { reason: AuthReason; onClose: () => void; onAuthenticated: (session: ApiSession) => Promise<void> }) {
  const [mode, setMode] = useState<AuthMode>("options");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [universities, setUniversities] = useState<ApiUniversity[]>([]);

  useEffect(() => {
    if (mode !== "signup" || !apiConfigured) return;
    let active = true;
    void listUniversities().then((items) => { if (active) setUniversities(items); }).catch(() => { if (active) setError("University list is temporarily unavailable."); });
    return () => { active = false; };
  }, [mode]);

  const reasonCopy = reason === "post" ? "Create an account to publish a trusted campus report." : reason === "claim" ? "Create an account so your ownership claim can be reviewed securely." : "Sign in to keep your reports and alerts in one place.";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      let next: ApiSession;
      if (!apiConfigured) {
        next = demoSession(String(form.get("fullName") || "Demo Student"), String(form.get("email") || "demo.student@example.edu"));
        await new Promise((resolve) => window.setTimeout(resolve, 450));
      } else if (mode === "signin") {
        next = await login({ email: String(form.get("email")), password: String(form.get("password")) });
      } else {
        const universityId = String(form.get("universityId") || universities[0]?._id || "");
        next = await register({ fullName: String(form.get("fullName")), email: String(form.get("email")), matricNumber: String(form.get("matricNumber")), password: String(form.get("password")), universityId });
      }
      await onAuthenticated(next);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "We could not complete sign-in.");
    } finally {
      setLoading(false);
    }
  }

  return <div className="sheet-layer" role="dialog" aria-modal="true" aria-label="Sign in to CampusFind"><button type="button" className="sheet-scrim" aria-label="Close sign in" onClick={onClose} /><section className="auth-sheet"><span className="sheet-handle" /><div className="sheet-heading"><div><Mark compact /><span><small>CampusFind</small><b>{mode === "options" ? "Join to continue" : mode === "signin" ? "Welcome back" : "Create your account"}</b></span></div><button type="button" onClick={onClose}><X size={19} /></button></div>{mode === "options" && <><p className="auth-reason">{reasonCopy}</p><button type="button" className="email-button" onClick={() => setMode("signup")}><Mail size={18} />Continue with email</button><button type="button" className="existing-link" onClick={() => setMode("signin")}>Already have an account? <b>Sign in</b></button><p className="guest-note"><ShieldCheck size={15} />You may browse CampusFind without an account.</p></>}{mode !== "options" && <form className="auth-form" onSubmit={submit}>{mode === "signup" && <><label><span>Full name</span><input name="fullName" required placeholder="Demo Student" /></label><label><span>Matric number</span><input name="matricNumber" required placeholder="UI-DEMO-001" /></label>{apiConfigured && <label><span>University</span><select name="universityId" required defaultValue=""><option value="" disabled>Choose your university</option>{universities.map((university) => <option key={university._id} value={university._id}>{university.name}</option>)}</select></label>}</>}<label><span>School email</span><input name="email" type="email" required placeholder="demo.student@example.edu" /></label><label><span>Password</span><input name="password" type="password" minLength={8} required placeholder="At least 8 characters" /></label>{error && <p className="auth-error">{error}</p>}<button type="submit" className="primary-app-button" disabled={loading}>{loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}<ArrowRight size={17} /></button><button type="button" className="back-to-options" onClick={() => { setMode("options"); setError(""); }}><ArrowLeft size={15} />Other sign-in options</button>{mode === "signup" && <p className="auth-terms">By continuing, you agree to the CampusFind safety and privacy rules.</p>}</form>}</section></div>;
}
