"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BatteryFull,
  Bell,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Camera,
  Headphones,
  Home,
  IdCard,
  ImagePlus,
  KeyRound,
  LockKeyhole,
  LocateFixed,
  Mail,
  MapPin,
  MessageCircle,
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
  confirmHandover,
  getMatch,
  getCurrentSession,
  getClaimEvidenceUrl,
  listReports,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  listAdminClaims,
  listChatMessages,
  listMyHandovers,
  listMyClaims,
  listMyMatches,
  listUniversities,
  login,
  logout,
  publishReport,
  requestPasswordReset,
  readSession,
  register,
  removeSession,
  reviewClaim,
  saveSession,
  resendEmailVerification,
  resetPassword,
  startOAuth,
  startOAuthLink,
  verifyEmail,
  sendChatMessage,
  submitClaim,
  uploadFile,
  type ApiAdminClaim,
  type ApiChatMessage,
  type ApiClaimRecord,
  type ApiHandover,
  type ApiMatch,
  type ApiNotification,
  type ApiReport,
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
type AuthMode = "options" | "signin" | "signup" | "verify" | "reset";
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
    latitude: report.location.latitude,
    longitude: report.location.longitude,
    date: new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(report.happenedAt)),
    reporter: typeof report.reporter === "object" && report.reporter
      ? report.reporter.fullName || "CampusFind member"
      : "CampusFind member",
    status: report.status,
    image: report.imageUrls?.[0],
    accent: report.type === "found" ? "#e6f7ee" : "#eaf0ff",
    initials: report.title.split(" ").slice(0, 2).map((word) => word[0]).join("").toUpperCase(),
  };
}

function mapApiNotification(item: ApiNotification): NotificationItem {
  return {
    id: item._id,
    title: item.title,
    message: item.message,
    time: new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt)),
    kind: item.kind === "match" || item.kind === "claim" || item.kind === "handover" || item.kind === "chat" ? item.kind : "system",
    read: Boolean(item.readAt),
    actionPath: item.actionPath,
  };
}

function reportOwnerId(report: Pick<ApiReport, "reporter">) {
  if (typeof report.reporter === "string") return report.reporter;
  return report.reporter?._id || report.reporter?.id || null;
}

export default function CampusFindApp() {
  const [entry, setEntry] = useState<EntryPhase>("splash");
  const [slide, setSlide] = useState(0);
  const [screen, setScreen] = useState<Screen>("home");
  const [session, setSession] = useState<ApiSession | null>(null);
  const [reports, setReports] = useState(seedReports);
  const [matches, setMatches] = useState<ApiMatch[]>([]);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [activeHandoverId, setActiveHandoverId] = useState<string | null>(null);
  const [chatMatchId, setChatMatchId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState(apiConfigured ? [] : seedNotifications);
  const [selectedReport, setSelectedReport] = useState(seedReports[2]);
  const [reportType, setReportType] = useState<ReportType>("lost");
  const [authReason, setAuthReason] = useState<AuthReason | null>(null);
  const [protectedDestination, setProtectedDestination] = useState<Screen>("home");
  const [toast, setToast] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const oauthResult = new URLSearchParams(window.location.search);
      const oauthSuccess = oauthResult.get("oauth") === "success";
      const oauthError = oauthResult.get("oauthError");
      if (oauthSuccess) {
        window.history.replaceState({}, "", window.location.pathname);
        void getCurrentSession().then((nextSession) => {
          saveSession(nextSession);
          setSession(nextSession);
          setEntry("app");
        }).catch(() => {
          setToast("The provider sign-in could not be completed.");
          setSession(null);
          setEntry("app");
        });
      } else {
        setSession(readSession());
        setEntry(window.localStorage.getItem(ONBOARDING_KEY) ? "app" : "onboarding");
        if (oauthError === "account_not_found") setToast("Create and verify your school email account before linking Google or Apple.");
        if (oauthError) window.history.replaceState({}, "", window.location.pathname);
      }
    }, 1150);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const activeSession = session;
    if (!apiConfigured || !activeSession || activeSession.token === "campusfind-demo-session") return;
    const sessionToken = activeSession.token;
    const universityId = activeSession.user.university.id;
    let active = true;
    async function refreshAccountData() {
      const results = await Promise.allSettled([
        listReports(universityId),
        listMyMatches(sessionToken),
        listNotifications(sessionToken),
      ]);
      if (!active) return;
      const [reportsResult, matchesResult, notificationsResult] = results;
      if (reportsResult.status === "fulfilled") setReports(reportsResult.value.map(mapApiReport));
      if (matchesResult.status === "fulfilled") {
        setMatches(matchesResult.value);
        setActiveMatchId((current) => matchesResult.value.some((match) => match._id === current)
          ? current
          : matchesResult.value[0]?._id || null);
      }
      if (notificationsResult.status === "fulfilled") setNotifications(notificationsResult.value.map(mapApiNotification));
    }
    void refreshAccountData();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refreshAccountData();
    }, 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [session]);

  const unread = notifications.filter((item) => !item.read).length;
  const demoMode = !apiConfigured || session?.token === "campusfind-demo-session";
  const activeMatch = matches.find((match) => match._id === activeMatchId) || matches[0] || null;
  const lostReport = activeMatch
    ? mapApiReport(activeMatch.lostReport)
    : reports.find((item) => item.id === featuredMatch.lostReportId) || reports[0] || seedReports[0];
  const foundReport = activeMatch
    ? mapApiReport(activeMatch.foundReport)
    : reports.find((item) => item.id === featuredMatch.foundReportId) || reports[1] || seedReports[1];
  const matchScore = activeMatch?.score ?? featuredMatch.score;
  const matchFactors = activeMatch?.factors ?? featuredMatch.factors;
  const hasMatch = Boolean(activeMatch || demoMode);
  const canClaim = demoMode || Boolean(session && activeMatch && reportOwnerId(activeMatch.lostReport) === session.user.id);

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
    if (session && session.token !== "campusfind-demo-session") void logout(session.token).catch(() => undefined);
    removeSession();
    setSession(null);
    setReports(seedReports);
    setMatches([]);
    setActiveMatchId(null);
    navigate("home");
    showToast("You are browsing as a guest");
  }

  function openReport(report: ItemReport) {
    setSelectedReport(report);
    navigate("detail");
  }

  function openClaimMatch(report: ItemReport) {
    if (!session) {
      requireAccount("match", "claim");
      return;
    }
    const candidate = matches.find((match) =>
      match.foundReport._id === report.id && reportOwnerId(match.lostReport) === session.user.id,
    );
    if (!candidate && demoMode && report.id === "found-wallet-01") {
      setActiveMatchId(null);
      navigate("match");
      return;
    }
    if (!candidate) {
      showToast("Ownership claims start from a suggested match linked to your lost report.");
      return;
    }
    setActiveMatchId(candidate._id);
    navigate("match");
  }

  function openMatch(actionPath?: string) {
    const requestedId = actionPath?.split("/").filter(Boolean).at(-1);
    if (requestedId && session && !demoMode && !matches.some((match) => match._id === requestedId)) {
      void getMatch(session.token, requestedId).then((match) => {
        setMatches((items) => [match, ...items.filter((item) => item._id !== match._id)]);
        setActiveMatchId(match._id);
        navigate("match");
      }).catch(() => showToast("This match could not be loaded. Please refresh and try again."));
      return;
    }
    setActiveMatchId(requestedId && matches.some((match) => match._id === requestedId) ? requestedId : matches[0]?._id || null);
    navigate("match");
  }

  function openClaimNotification(actionPath?: string) {
    if (!session || demoMode) {
      openMatch();
      return;
    }
    const claimId = actionPath?.split("/").filter(Boolean).at(-1);
    void listMyClaims(session.token).then(async (claims) => {
      const claim = claims.find((item) => item._id === claimId);
      const matchId = typeof claim?.match === "string" ? claim.match : claim?.match._id;
      if (!matchId) {
        showToast("We could not find the claim linked to this alert.");
        return;
      }
      const match = await getMatch(session.token, matchId);
      setMatches((items) => [match, ...items.filter((item) => item._id !== match._id)]);
      setActiveMatchId(matchId);
      navigate("claim");
    }).catch(() => showToast("Your claim could not be loaded. Please try again."));
  }

  function openHandoverNotification(actionPath?: string) {
    const handoverId = actionPath?.split("/").filter(Boolean).at(-1);
    if (!handoverId) {
      showToast("This handover link is not available.");
      return;
    }
    setActiveHandoverId(handoverId);
    navigate("handover");
  }

  async function beginOAuth(provider: "google" | "apple", link = false) {
    try {
      const url = link
        ? await startOAuthLink(session?.token || "", provider)
        : await startOAuth(provider);
      window.location.assign(url);
    } catch (issue) {
      showToast(issue instanceof Error ? issue.message : `Could not start ${provider} sign-in.`);
    }
  }

  function openChat(matchId = activeMatch?._id) {
    if (!matchId) {
      showToast("Open a suggested match before starting a chat.");
      return;
    }
    setChatMatchId(matchId);
    navigate("chat");
  }

  function openChatNotification(actionPath?: string) {
    const matchId = actionPath?.split("/").filter(Boolean).at(-1);
    if (!matchId) {
      showToast("This conversation link is not available.");
      return;
    }
    openChat(matchId);
  }

  async function addReport(report: ItemReport, happenedAt: string, privateDetails: string, photo: File | null, consentImageAnalysis: boolean) {
    let message = "Your report is live";
    if (apiConfigured && session && session.token !== "campusfind-demo-session") {
      try {
        const uploadedPhoto = photo ? await uploadFile(session.token, photo, "report-media") : null;
        const result = await publishReport(session.token, {
          type: report.type,
          title: report.title,
          category: report.category,
          publicDescription: report.description,
          ...(report.type === "found" && privateDetails.trim() ? { privateDetails: privateDetails.trim() } : {}),
          consentImageAnalysis,
          location: { label: report.location, latitude: report.latitude, longitude: report.longitude },
          happenedAt,
          imageKeys: uploadedPhoto ? [uploadedPhoto.key] : [],
        });
        message = result.meta.matchesCreated
          ? `${result.meta.matchesCreated} possible match found`
          : "Report saved and matching has started";
        const [remoteReports, remoteMatches] = await Promise.all([
          listReports(session.user.university.id),
          listMyMatches(session.token),
        ]);
        setReports(remoteReports.map(mapApiReport));
        setMatches(remoteMatches);
        setActiveMatchId(remoteMatches[0]?._id || null);
      } catch {
        message = "The report could not be saved. Please try again.";
        showToast(message);
        return;
      }
    } else {
      setReports((items) => [report, ...items]);
    }
    setNotifications((items) => [
      {
        id: `notice-${Date.now()}`,
        title: "Your report is active",
        message: `We are comparing ${report.title.toLowerCase()} with campus reports.`,
        time: "Just now",
        kind: "system",
        read: false,
      },
      ...items,
    ]);
    setSelectedReport(report);
    showToast(message);
    navigate("detail");
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
              matchScore={matchScore}
              hasMatch={hasMatch}
              onOpenReport={openReport}
              onNavigate={navigate}
              onMatch={openMatch}
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
              onClaim={() => openClaimMatch(selectedReport)}
            />
          )}
          {screen === "match" && hasMatch && (
            <MatchView
              lost={lostReport}
              found={foundReport}
              score={matchScore}
              factors={matchFactors}
              status={activeMatch?.status || "suggested"}
              canClaim={canClaim}
              onBack={() => navigate("home")}
              onClaim={() => requireAccount("claim", "claim")}
              onChat={() => openChat(activeMatch?._id)}
            />
          )}
          {screen === "match" && !hasMatch && <NoMatchView onBack={() => navigate("home")} />}
          {screen === "create" && <CreateView initialType={reportType} onBack={() => navigate("home")} onPublish={addReport} />}
          {screen === "claim" && (
            <ClaimView
              matchId={activeMatch?._id || featuredMatch.id}
              report={foundReport || selectedReport}
              session={session}
              demoMode={demoMode}
              onBack={() => navigate("match")}
              onDone={() => navigate("notifications")}
              showToast={showToast}
            />
          )}
          {screen === "handover" && <HandoverView session={session} handoverId={activeHandoverId} showToast={showToast} onBack={() => navigate("notifications")} />}
          {screen === "chat" && <ChatView session={session} matchId={chatMatchId || activeMatch?._id || null} showToast={showToast} onBack={() => navigate("match")} />}
          {screen === "notifications" && (
            <AlertsView notifications={notifications} setNotifications={setNotifications} session={session} onMatch={openMatch} onClaim={openClaimNotification} onHandover={openHandoverNotification} onChat={openChatNotification} onSignIn={() => {
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
              onLinkProvider={(provider) => void beginOAuth(provider, true)}
            />
          )}
          {screen === "admin" && <AdminView session={session} showToast={showToast} onBack={() => navigate("profile")} />}
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
            onOAuth={(provider) => beginOAuth(provider)}
            onResetRequest={requestPasswordReset}
            onResetPassword={resetPassword}
            onResendVerification={resendEmailVerification}
            onVerifyEmail={async (input) => {
              const verified = await verifyEmail(input);
              await completeAuthentication(verified);
            }}
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
  matchScore,
  hasMatch,
  onOpenReport,
  onNavigate,
  onMatch,
  onReport,
  onAlerts,
}: {
  session: ApiSession | null;
  unread: number;
  reports: ItemReport[];
  lostReport: ItemReport;
  foundReport: ItemReport;
  matchScore: number;
  hasMatch: boolean;
  onOpenReport: (report: ItemReport) => void;
  onNavigate: (screen: Screen) => void;
  onMatch: () => void;
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

      <section className="match-preview">
        <div className="match-preview-top"><span><Sparkles size={15} /> Smart match</span>{hasMatch ? <strong>{matchScore}%</strong> : <small>Waiting</small>}</div>
        <h2>{hasMatch ? `These reports may describe the same ${lostReport.category.toLowerCase()}.` : "Your possible matches will appear here."}</h2>
        {hasMatch && <div className="match-thumbnails"><ReportThumb report={lostReport} /><i /><ReportThumb report={foundReport} /></div>}
        <button type="button" onClick={onMatch} disabled={!hasMatch}>{hasMatch ? "Review match" : "No suggestions yet"} <ArrowRight size={16} /></button>
      </section>

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
        {report.latitude !== undefined && report.longitude !== undefined && <LocationMapPreview latitude={report.latitude} longitude={report.longitude} label={report.location} />}
        <div className="reporter-row"><span className="mini-avatar">{report.reporter.split(" ").map((word) => word[0]).slice(0, 2).join("")}</span><span><small>Reported by</small><strong>{report.reporter}</strong></span><BadgeCheck size={18} /></div>
        <article className="detail-description"><h2>What we know</h2><p>{report.description}</p></article>
        <article className="safety-card"><ShieldCheck size={21} /><div><strong>Keep private details private</strong><p>Use a unique hidden feature to prove ownership. Never share a PIN or bank information.</p></div></article>
      </section>
      {report.type === "found" && <div className="sticky-action"><button type="button" className="primary-app-button" onClick={onClaim}><LockKeyhole size={18} />Review possible match</button></div>}
    </main>
  );
}

function MatchView({ lost, found, score, factors: matchFactors, status, canClaim, onBack, onClaim, onChat }: {
  lost: ItemReport;
  found: ItemReport;
  score: number;
  factors: ApiMatch["factors"];
  status: ApiMatch["status"];
  canClaim: boolean;
  onBack: () => void;
  onClaim: () => void;
  onChat: () => void;
}) {
  const factorRows = [
    ["Image", matchFactors.image],
    ["Description", matchFactors.text],
    ["Details", matchFactors.attributes],
    ["Location", matchFactors.location],
    ["Date", matchFactors.date],
  ] as const;
  return (
    <main className="mobile-page match-page">
      <CompactHeader title="Possible match" onBack={onBack} />
      <section className="match-score-card"><span><Sparkles size={20} /></span><div><p className="micro-label">{status === "suggested" ? "Possible match" : `Case ${status.replace("_", " ")}`}</p><h1>{score}% match</h1><p>Two reports share several clues. This score is a suggestion, not proof.</p></div></section>
      <div className="match-pair"><article><div><ReportImage report={lost} /></div><small>{canClaim ? "Your lost report" : "Owner’s lost report"}</small><h3>{lost.title}</h3><p><MapPin size={12} />{lost.location}</p></article><span className="match-connector"><Sparkles size={17} /></span><article><div><ReportImage report={found} /></div><small>{canClaim ? "Found nearby" : "Your found report"}</small><h3>{found.title}</h3><p><MapPin size={12} />{found.location}</p></article></div>
      <section className="factor-card"><div className="section-title"><div><p className="micro-label">Transparent matching</p><h2>Why it matched</h2></div></div>{factorRows.map(([label, value]) => <div className="factor-row" key={label}><span><b>{label}</b><em>{value}%</em></span><div><i style={{ width: `${value}%` }} /></div></div>)}</section>
      {canClaim ? <>
        <section className="match-next"><ShieldCheck size={21} /><div><strong>Ready to verify?</strong><p>Tell us one private detail that only the owner should know. An administrator reviews every claim.</p></div></section>
        <div className="inline-actions"><button type="button" className="primary-app-button" onClick={onClaim}>This is mine <ArrowRight size={18} /></button><button type="button" className="secondary-app-button" onClick={onBack}>Not my item</button></div>
      </> : <section className="match-next"><ShieldCheck size={21} /><div><strong>This match is linked to your found report.</strong><p>The item owner can submit a private claim. You will be notified when the claim is reviewed.</p></div></section>}
      {(status === "reviewing" || status === "approved") && <button type="button" className="secondary-app-button match-chat-button" onClick={onChat}><MessageCircle size={17} />Message the other participant</button>}
    </main>
  );
}

function NoMatchView({ onBack }: { onBack: () => void }) {
  return <main className="mobile-page match-page"><CompactHeader title="Possible matches" onBack={onBack} /><div className="empty-workflow"><span><Sparkles size={24} /></span><h1>No possible matches yet</h1><p>When a report matches one of yours, you will see the details and score here.</p><button type="button" className="primary-app-button" onClick={onBack}>Back to CampusFind</button></div></main>;
}

function LocationMapPreview({ latitude, longitude, label }: { latitude: number; longitude: number; label: string }) {
  const padding = 0.004;
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${longitude - padding}%2C${latitude - padding}%2C${longitude + padding}%2C${latitude + padding}&layer=mapnik&marker=${latitude}%2C${longitude}`;
  return <div className="location-map-preview"><iframe title={`Map preview for ${label}`} loading="lazy" src={mapUrl} /><small>© OpenStreetMap contributors</small></div>;
}

function CreateView({ initialType, onBack, onPublish }: { initialType: ReportType; onBack: () => void; onPublish: (report: ItemReport, happenedAt: string, privateDetails: string, photo: File | null, consentImageAnalysis: boolean) => Promise<void> }) {
  const [step, setStep] = useState(1);
  const [photoName, setPhotoName] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [consentImageAnalysis, setConsentImageAnalysis] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [draft, setDraft] = useState({ type: initialType, title: "", category: "" as ItemCategory | "", description: "", privateDetails: "", location: "", latitude: undefined as number | undefined, longitude: undefined as number | undefined, date: "" });

  function next() {
    if (step === 1) {
      setFormError("");
      setStep(2);
      return;
    }
    if (!draft.title.trim() || !draft.category || !draft.location.trim() || !draft.date || draft.description.trim().length < 10) {
      setFormError("Add an item name, category, date, location and a description of at least 10 characters.");
      return;
    }
    if (draft.type === "found" && draft.privateDetails.trim().length < 10) {
      setFormError("Add a private identifying detail of at least 10 characters. Only authorised reviewers can see it.");
      return;
    }
    setFormError("");
    setStep((value) => Math.min(3, value + 1));
  }

  function useDeviceLocation() {
    if (!navigator.geolocation) {
      setFormError("This browser does not support device location. Enter a campus landmark instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDraft((current) => ({
          ...current,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          location: current.location || "Current location",
        }));
        setFormError("");
      },
      () => setFormError("Location was not available. Enter a campus landmark instead."),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
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
      latitude: draft.latitude,
      longitude: draft.longitude,
      date: new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(draft.date)),
      reporter: "Demo Student",
      status: "open",
      accent: draft.type === "found" ? "#e6f7ee" : "#eaf0ff",
      initials: draft.title.split(" ").slice(0, 2).map((word) => word[0]).join("").toUpperCase(),
    };
    await onPublish(report, new Date(draft.date).toISOString(), draft.privateDetails, photo, consentImageAnalysis);
    setSubmitting(false);
  }

  return (
    <main className="mobile-page create-page">
      <CompactHeader title="New report" onBack={step > 1 ? () => setStep(step - 1) : onBack} action={<button className="draft-link" type="button">Save draft</button>} />
      <div className="step-progress"><span>Step {step} of 3</span><div>{[1, 2, 3].map((item) => <i key={item} className={item <= step ? "active" : ""} />)}</div></div>
      <form onSubmit={submit}>
        {step === 1 && <section className="create-step"><p className="micro-label">Let us start</p><h1>What happened?</h1><p className="step-copy">Choose the report type. You can still change it before publishing.</p><div className="report-choice"><button type="button" className={draft.type === "lost" ? "active" : ""} onClick={() => setDraft({ ...draft, type: "lost" })}><span><PackageOpen size={25} /></span><b>I lost an item</b><small>Help me find it</small><CheckCircle2 size={18} /></button><button type="button" className={draft.type === "found" ? "active found" : ""} onClick={() => setDraft({ ...draft, type: "found" })}><span><PackageCheck size={25} /></span><b>I found an item</b><small>Help return it</small><CheckCircle2 size={18} /></button></div></section>}
        {step === 2 && <section className="create-step"><p className="micro-label">Useful clues</p><h1>Describe the item.</h1><p className="step-copy">Clear public details give the matching system better evidence. Keep unique ownership clues private.</p><div className="mobile-form"><label><span>Item name</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Black leather wallet" required /></label><label><span>Category</span><select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as ItemCategory })} required><option value="">Choose category</option>{categories.filter((item) => item.label !== "All").map((item) => <option key={item.label}>{item.label}</option>)}</select></label><label><span>{draft.type === "lost" ? "Last seen" : "Found at"}</span><div className="location-entry"><div className="input-icon"><MapPin size={17} /><input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="Kenneth Dike Library" required /></div><button className="location-gps" type="button" onClick={useDeviceLocation}><LocateFixed size={15} />Use my location</button></div>{draft.latitude !== undefined && draft.longitude !== undefined && <LocationMapPreview latitude={draft.latitude} longitude={draft.longitude} label={draft.location || "Selected location"} />}</label><label><span>Date</span><input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} required /></label><label><span>Public description</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={4} placeholder="Colour, size, brand and visible features…" required /></label>{draft.type === "found" && <label><span>Private identifying detail · reviewer only</span><textarea value={draft.privateDetails} onChange={(event) => setDraft({ ...draft, privateDetails: event.target.value })} rows={3} minLength={10} maxLength={1000} placeholder="A concealed mark, unusual contents or another detail an owner can confirm" required /><small>This stays hidden from public reports and is shown only to authorised claim reviewers.</small></label>}</div>{formError && <p className="workflow-error" role="alert">{formError}</p>}</section>}
        {step === 3 && <section className="create-step"><p className="micro-label">Final touch</p><h1>Add a clear photo.</h1><p className="step-copy">A useful photo can improve a visual match. Keep identity numbers out of view.</p><label className="mobile-upload"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0] || null; setPhoto(file); setPhotoName(file?.name || ""); }} /><span><ImagePlus size={25} /></span><b>{photoName || "Choose from your phone"}</b><small>{photoName ? "Uploads securely with your report" : "JPG, PNG or WEBP · up to 8 MB · optional"}</small></label>{photo && <label className="claim-check image-analysis-consent"><input type="checkbox" checked={consentImageAnalysis} onChange={(event) => setConsentImageAnalysis(event.target.checked)} /><span>Allow CampusFind to analyze visible item traits in this photo to suggest matches. Names and ID numbers will not be transcribed.</span></label>}<div className="publish-summary"><span className={`report-kind ${draft.type}`}>{draft.type}</span><h3>{draft.title}</h3><p><MapPin size={13} />{draft.location}</p><small>{draft.category} · {draft.date}</small></div><div className="privacy-line"><ShieldCheck size={18} /><p>Your name and contact details will not appear in the public report.</p></div></section>}
        <div className="create-footer">{step < 3 ? <button type="button" className="primary-app-button" onClick={next}>Continue <ArrowRight size={18} /></button> : <button type="submit" className="primary-app-button" disabled={submitting}>{submitting ? "Publishing…" : "Publish report"}<ArrowRight size={18} /></button>}</div>
      </form>
    </main>
  );
}

function ClaimView({ matchId, report, session, demoMode, onBack, onDone, showToast }: {
  matchId: string;
  report: ItemReport;
  session: ApiSession | null;
  demoMode: boolean;
  onBack: () => void;
  onDone: () => void;
  showToast: (message: string) => void;
}) {
  const [claim, setClaim] = useState<{ id: string; status: string } | null>(null);
  const [existingClaim, setExistingClaim] = useState<ApiClaimRecord | null>(null);
  const claimCheckKey = `${session?.token || "demo"}:${matchId}`;
  const [checkedClaimKey, setCheckedClaimKey] = useState("");
  const checkingExisting = !demoMode && Boolean(session) && checkedClaimKey !== claimCheckKey;
  const [submitting, setSubmitting] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (demoMode || !session) return;
    let active = true;
    void listMyClaims(session.token).then((items) => {
      if (!active) return;
      const current = items.find((item) => (typeof item.match === "string" ? item.match : item.match._id) === matchId);
      setExistingClaim(current || null);
    }).catch((issue) => {
      if (active) setError(issue instanceof Error ? issue.message : "Your existing claim could not be loaded.");
    }).finally(() => {
      if (active) setCheckedClaimKey(claimCheckKey);
    });
    return () => { active = false; };
  }, [session, matchId, demoMode, claimCheckKey]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const privateDetail = String(form.get("privateDetail") || "");
    try {
      if (demoMode) {
        setClaim({ id: `CF-DEMO-${Date.now().toString().slice(-6)}`, status: "pending" });
        showToast("Demo claim submitted for review");
      } else {
        if (!session) throw new Error("Sign in before submitting an ownership claim.");
        const evidence = proofFile ? await uploadFile(session.token, proofFile, "claim-evidence") : null;
        const result = await submitClaim(session.token, { matchId, privateDetail, proofKeys: evidence ? [evidence.key] : [] });
        setClaim({ id: result.id, status: result.status });
        setExistingClaim({ _id: result.id, status: result.status, createdAt: result.createdAt, match: { _id: matchId } });
        showToast("Claim submitted for private review");
      }
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "We could not submit your claim. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (claim) return <main className="mobile-page claim-success"><span><CheckCircle2 size={39} /></span><p className="micro-label">Claim received</p><h1>Your claim is waiting for review.</h1><p>An administrator will assess your private answer. A match score alone never approves ownership.</p><div><small>Claim reference</small><strong>{claim.id}</strong><small>Status: {claim.status}</small></div><button type="button" className="primary-app-button" onClick={onDone}>View updates</button></main>;
  if (checkingExisting) return <main className="mobile-page claim-page"><CompactHeader title="Verify ownership" onBack={onBack} /><p className="workflow-note">Checking your claim status…</p></main>;
  if (existingClaim && existingClaim.status !== "more_evidence") {
    const title = existingClaim.status === "approved" ? "Your claim was approved." : existingClaim.status === "rejected" ? "Your claim was not approved." : "Your claim is awaiting review.";
    const detail = existingClaim.status === "approved" ? "Check your alerts for the agreed handover point and time." : existingClaim.status === "rejected" ? existingClaim.reviewNote || "Contact your university administrator if you need help with this decision." : "An authorised administrator will review the private information you submitted.";
    return <main className="mobile-page claim-success"><span><ShieldCheck size={39} /></span><p className="micro-label">Claim status</p><h1>{title}</h1><p>{detail}</p><div><small>Claim reference</small><strong>{existingClaim._id}</strong><small>Status: {existingClaim.status.replace("_", " ")}</small></div><button type="button" className="primary-app-button" onClick={onDone}>View updates</button></main>;
  }
  const requestingMoreEvidence = existingClaim?.status === "more_evidence";
  return <main className="mobile-page claim-page"><CompactHeader title="Verify ownership" onBack={onBack} /><section className="claim-item"><div><ReportImage report={report} /></div><span><small>You are claiming</small><strong>{report.title}</strong><p><MapPin size={12} />{report.location}</p></span></section>{requestingMoreEvidence && <section className="claim-request-note"><strong>More information requested</strong><p>{existingClaim.reviewNote || "Please add another detail that helps verify ownership."}</p></section>}<form onSubmit={(event) => void submit(event)}><div className="claim-intro"><span><LockKeyhole size={20} /></span><div><h1>{requestingMoreEvidence ? "Add the requested information." : "Tell us something only the owner would know."}</h1><p>Your answer is hidden from the public and shared only with an authorised reviewer.</p></div></div><label className="claim-question"><span>Private identifying detail</span><textarea name="privateDetail" rows={5} minLength={10} maxLength={1500} required placeholder="For example: a name inside, a unique scratch or something kept in the item…" /><small>Never enter a password, card PIN or bank information. An administrator may request more evidence.</small></label><label className="claim-proof"><Camera size={20} /><span><b>{proofFile?.name || "Add a private photo or receipt"}</b><small>PDF, JPG, PNG or WEBP · up to 8 MB · optional</small></span><Plus size={17} /><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => { const file = event.target.files?.[0] || null; setProofFile(file && file.size <= 8 * 1024 * 1024 ? file : null); if (file && file.size > 8 * 1024 * 1024) setError("Evidence files must be 8 MB or smaller."); }} /></label>{error && <p className="workflow-error" role="alert">{error}</p>}<label className="claim-check"><input type="checkbox" required /><span>I confirm that this item belongs to me and the information is truthful.</span></label><button className="primary-app-button" type="submit" disabled={submitting}>{submitting ? "Sending…" : requestingMoreEvidence ? "Resubmit for review" : "Send for review"} <ArrowRight size={18} /></button></form></main>;
}

function AlertsView({ notifications, setNotifications, session, onMatch, onClaim, onHandover, onChat, onSignIn }: { notifications: NotificationItem[]; setNotifications: (update: (items: NotificationItem[]) => NotificationItem[]) => void; session: ApiSession | null; onMatch: (actionPath?: string) => void; onClaim: (actionPath?: string) => void; onHandover: (actionPath?: string) => void; onChat: (actionPath?: string) => void; onSignIn: () => void }) {
  if (!session) return <main className="mobile-page alerts-page"><SimpleTitle title="Alerts" /><div className="guest-state"><span><Bell size={26} /></span><h1>Matches should find you.</h1><p>Sign in to receive possible-match, claim-review and handover alerts.</p><button type="button" className="primary-app-button" onClick={onSignIn}>Sign in for alerts</button><small>You can continue browsing without an account.</small></div></main>;
  const activeSession = session;
  async function openNotification(item: NotificationItem) {
    setNotifications((items) => items.map((notice) => notice.id === item.id ? { ...notice, read: true } : notice));
    if (apiConfigured && activeSession.token !== "campusfind-demo-session" && item.id.length > 20) {
      try { await markNotificationRead(activeSession.token, item.id); } catch { /* Keep the local read state; refresh can reconcile it. */ }
    }
    if (item.kind === "match") onMatch(item.actionPath);
    if (item.kind === "claim") onClaim(item.actionPath);
    if (item.kind === "handover") onHandover(item.actionPath);
    if (item.kind === "chat") onChat(item.actionPath);
  }
  async function markAllRead() {
    setNotifications((items) => items.map((item) => ({ ...item, read: true })));
    if (apiConfigured && activeSession.token !== "campusfind-demo-session") {
      try { await markAllNotificationsRead(activeSession.token); } catch { /* The next refresh will reconcile server state. */ }
    }
  }
  return <main className="mobile-page alerts-page"><SimpleTitle title="Alerts" /><div className="today-label">Your updates <button type="button" onClick={markAllRead}>Mark all read</button></div><div className="alert-list">{notifications.map((item) => <button type="button" key={item.id} className={!item.read ? "alert-card unread" : "alert-card"} onClick={() => void openNotification(item)}><span className={`alert-icon ${item.kind}`}>{item.kind === "match" ? <Sparkles size={19} /> : item.kind === "claim" ? <ShieldCheck size={19} /> : item.kind === "handover" ? <PackageCheck size={19} /> : item.kind === "chat" ? <MessageCircle size={19} /> : <Bell size={19} />}</span><span><strong>{item.title}</strong><p>{item.message}</p><small>{item.time}</small></span>{item.kind !== "system" && <ChevronRight size={17} />}</button>)}</div></main>;
}

function ChatView({ session, matchId, showToast, onBack }: {
  session: ApiSession | null;
  matchId: string | null;
  showToast: (message: string) => void;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<ApiChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const lastMessageAt = useRef<string | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session || !apiConfigured || session.token === "campusfind-demo-session" || !matchId) return;
    const sessionToken = session.token;
    const activeMatchId = matchId;
    let active = true;
    async function refresh(initial = false) {
      try {
        const after = initial ? undefined : lastMessageAt.current
          ? new Date(new Date(lastMessageAt.current).getTime() - 1).toISOString()
          : undefined;
        const incoming = await listChatMessages(sessionToken, activeMatchId, after);
        if (!active) return;
        if (incoming.length) {
          setMessages((current) => {
            const byId = new Map(current.map((message) => [message._id, message]));
            incoming.forEach((message) => byId.set(message._id, message));
            return [...byId.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
          });
          const newest = incoming[incoming.length - 1];
          if (newest && (!lastMessageAt.current || newest.createdAt > lastMessageAt.current)) lastMessageAt.current = newest.createdAt;
        }
        if (initial) setLoading(false);
      } catch (issue) {
        if (active && initial) setError(issue instanceof Error ? issue.message : "This conversation could not be loaded.");
        if (active && initial) setLoading(false);
      }
    }
    void refresh(true);
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 4000);
    return () => { active = false; window.clearInterval(timer); };
  }, [session, matchId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !matchId || !draft.trim()) return;
    setSending(true);
    setError("");
    try {
      const message = await sendChatMessage(session.token, matchId, {
        body: draft.trim(),
        clientMessageId: window.crypto.randomUUID(),
      });
      setMessages((current) => current.some((item) => item._id === message._id) ? current : [...current, message]);
      lastMessageAt.current = message.createdAt;
      setDraft("");
      showToast("Message sent privately");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Your message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  if (!session || !apiConfigured || session.token === "campusfind-demo-session" || !matchId) {
    return <main className="mobile-page chat-page"><CompactHeader title="Private chat" onBack={onBack} /><div className="empty-workflow"><span><MessageCircle size={24} /></span><h1>Chat is available after a claim</h1><p>Sign in and open a match with an active ownership claim to message the other participant.</p><button type="button" className="primary-app-button" onClick={onBack}>Back to match</button></div></main>;
  }

  return <main className="mobile-page chat-page">
    <CompactHeader title="Private chat" onBack={onBack} />
    <div className="chat-privacy"><ShieldCheck size={16} /><span>Only the owner and finder can read this conversation. Keep phone numbers and email addresses private.</span></div>
    <div className="chat-message-list" ref={listRef} aria-live="polite">
      {loading ? <p className="workflow-note">Loading messages…</p> : messages.length === 0 ? <div className="chat-empty"><MessageCircle size={22} /><p>Start the conversation. Keep ownership evidence private and arrange handover through CampusFind.</p></div> : messages.map((message) => {
        const senderId = typeof message.sender === "string" ? message.sender : message.sender._id;
        const senderName = typeof message.sender === "string" ? "CampusFind member" : message.sender.fullName;
        const mine = senderId === session.user.id;
        return <article key={message._id} className={mine ? "chat-bubble mine" : "chat-bubble"}>
          {!mine && <small>{senderName}</small>}
          <p>{message.body}</p>
          <time dateTime={message.createdAt}>{new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(message.createdAt))}</time>
        </article>;
      })}
    </div>
    {error && <p className="workflow-error" role="alert">{error}</p>}
    <form className="chat-compose" onSubmit={(event) => void send(event)}>
      <label className="sr-only" htmlFor="chat-message">Write a private message</label>
      <textarea id="chat-message" rows={2} maxLength={2000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a message…" required />
      <button type="submit" className="primary-app-button" aria-label="Send message" disabled={sending || !draft.trim()}>{sending ? "Sending…" : <ArrowRight size={18} />}</button>
    </form>
    <small className="chat-note">Messages are stored with this case. Contact details are blocked.</small>
  </main>;
}

function HandoverView({ session, handoverId, showToast, onBack }: {
  session: ApiSession | null;
  handoverId: string | null;
  showToast: (message: string) => void;
  onBack: () => void;
}) {
  const [handover, setHandover] = useState<ApiHandover | null>(null);
  const [loadedHandoverId, setLoadedHandoverId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<{ id: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canLoad = Boolean(session && apiConfigured && session.token !== "campusfind-demo-session" && handoverId);
  const loading = canLoad && loadedHandoverId !== handoverId;

  useEffect(() => {
    if (!canLoad || !session || !handoverId) return;
    let active = true;
    void listMyHandovers(session.token).then((items) => {
      if (!active) return;
      const item = items.find((candidate) => candidate._id === handoverId);
      if (item) setHandover(item);
      else setLoadError({ id: handoverId, message: "This handover is not available to your account." });
    }).catch((issue) => {
      if (active) setLoadError({ id: handoverId, message: issue instanceof Error ? issue.message : "The handover could not be loaded." });
    }).finally(() => {
      if (active) setLoadedHandoverId(handoverId);
    });
    return () => { active = false; };
  }, [session, handoverId, canLoad]);

  async function confirm(party: "finder" | "owner") {
    if (!session || !handover) return;
    setBusy(true);
    setError("");
    try {
      const result = await confirmHandover(session.token, handover._id, party);
      setHandover({
        ...handover,
        finderConfirmedAt: result.finderConfirmedAt,
        ownerConfirmedAt: result.ownerConfirmedAt,
        completedAt: result.completedAt,
      });
      showToast(result.completedAt ? "Both parties confirmed the handover" : "Your confirmation has been recorded");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Your confirmation could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  if (!canLoad) return <main className="mobile-page handover-page"><CompactHeader title="Safe handover" onBack={onBack} /><div className="empty-workflow"><span><PackageCheck size={24} /></span><h1>Handover unavailable</h1><p>Sign in with an account linked to this handover.</p><button type="button" className="primary-app-button" onClick={onBack}>Back to alerts</button></div></main>;
  if (loading) return <main className="mobile-page handover-page"><CompactHeader title="Safe handover" onBack={onBack} /><p className="workflow-note">Loading handover details…</p></main>;
  if (!handover || handover._id !== handoverId) return <main className="mobile-page handover-page"><CompactHeader title="Safe handover" onBack={onBack} /><div className="empty-workflow"><span><PackageCheck size={24} /></span><h1>Handover unavailable</h1><p>{loadError?.id === handoverId ? loadError.message : "This handover could not be found."}</p><button type="button" className="primary-app-button" onClick={onBack}>Back to alerts</button></div></main>;

  const ownerId = typeof handover.claim.claimant === "string"
    ? handover.claim.claimant
    : handover.claim.claimant._id || handover.claim.claimant.id;
  const finderId = reportOwnerId(handover.claim.match.foundReport);
  const party = session?.user.id === ownerId ? "owner" : session?.user.id === finderId ? "finder" : null;
  const confirmedAt = party === "owner" ? handover.ownerConfirmedAt : party === "finder" ? handover.finderConfirmedAt : null;
  const scheduledFor = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short" }).format(new Date(handover.scheduledFor));

  return <main className="mobile-page handover-page">
    <CompactHeader title="Safe handover" onBack={onBack} />
    <section className="handover-card">
      <span className="handover-icon"><PackageCheck size={23} /></span>
      <p className="micro-label">{handover.completedAt ? "Transfer complete" : "Approved ownership claim"}</p>
      <h1>{handover.claim.match.foundReport.title}</h1>
      <p className="handover-item-meta">{handover.claim.match.foundReport.category} · {handover.claim.match.foundReport.location.label}</p>
      <div className="handover-detail"><small>Meet at</small><strong>{handover.handoverPoint}</strong></div>
      <div className="handover-detail"><small>Scheduled</small><strong>{scheduledFor}</strong></div>
      <div className="handover-confirmations"><span><b>Owner</b><small>{handover.ownerConfirmedAt ? "Confirmed" : "Waiting"}</small></span><span><b>Finder</b><small>{handover.finderConfirmedAt ? "Confirmed" : "Waiting"}</small></span></div>
      {handover.completedAt ? <p className="handover-complete">Both parties confirmed this return.</p> : party && !confirmedAt ? <button type="button" className="primary-app-button" disabled={busy} onClick={() => void confirm(party)}>{busy ? "Saving…" : party === "owner" ? "Confirm I received it" : "Confirm I handed it over"}</button> : party ? <p className="handover-complete">Your confirmation is recorded. The other person must confirm to close the case.</p> : <p className="workflow-note">Only the owner and finder can confirm this return.</p>}
      {error && <p className="workflow-error" role="alert">{error}</p>}
      <div className="handover-code"><small>Handover reference</small><strong>{handover.auditCode}</strong></div>
    </section>
  </main>;
}

function ProfileView({ session, onSignIn, onSignOut, onReplay, onAdmin, onLinkProvider }: { session: ApiSession | null; onSignIn: () => void; onSignOut: () => void; onReplay: () => void; onAdmin: () => void; onLinkProvider: (provider: "google" | "apple") => void }) {
  if (!session) return <main className="mobile-page profile-page"><SimpleTitle title="Account" /><section className="guest-profile"><div className="guest-portrait"><User size={30} /></div><p className="micro-label">Guest mode</p><h1>Browse freely.<br />Join when you need to act.</h1><p>Create an account only when you want to report or claim an item.</p><button type="button" className="primary-app-button" onClick={onSignIn}>Sign in or create account</button></section><SettingsList onReplay={onReplay} /></main>;
  const linkedProviders = session.user.linkedProviders || [];
  return <main className="mobile-page profile-page"><SimpleTitle title="Account" /><section className="signed-profile"><span className="profile-avatar">{session.user.fullName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div><p className="micro-label">{session.user.verified ? "Verified email" : "Email verification pending"}</p><h1>{session.user.fullName}</h1><p>{session.user.matricNumber} · University of Ibadan</p></div><BadgeCheck size={20} /></section><div className="profile-metrics"><div><strong>4</strong><span>Reports</span></div><div><strong>2</strong><span>Returned</span></div><div><strong>100%</strong><span>Safe record</span></div></div><section className="profile-options"><button type="button"><span><Bell size={18} /><span><b>Notification preferences</b><small>Matches, claims and handovers</small></span></span><ChevronRight size={17} /></button><button type="button"><span><ShieldCheck size={18} /><span><b>Privacy & verification</b><small>University identity and visibility</small></span></span><ChevronRight size={17} /></button>{apiConfigured && <><button type="button" disabled={linkedProviders.includes("google")} onClick={() => onLinkProvider("google")}><span><span className="provider-mark">G</span><span><b>{linkedProviders.includes("google") ? "Google connected" : "Connect Google"}</b><small>Use Google to sign in next time</small></span></span><ChevronRight size={17} /></button><button type="button" disabled={linkedProviders.includes("apple")} onClick={() => onLinkProvider("apple")}><span><span className="provider-mark apple"></span><span><b>{linkedProviders.includes("apple") ? "Apple connected" : "Connect Apple"}</b><small>Use Apple to sign in next time</small></span></span><ChevronRight size={17} /></button></>}{session.user.role === "admin" && <button type="button" onClick={onAdmin}><span><BadgeCheck size={18} /><span><b>Review centre</b><small>Claims and safe handovers</small></span></span><ChevronRight size={17} /></button>}<button type="button" onClick={onReplay}><span><Sparkles size={18} /><span><b>Replay welcome tour</b><small>See how CampusFind works</small></span></span><ChevronRight size={17} /></button><button type="button"><span><CircleHelp size={18} /><span><b>Help & safety</b><small>Report rules and support</small></span></span><ChevronRight size={17} /></button></section><button className="sign-out-button" type="button" onClick={onSignOut}>Sign out</button></main>;
}

function SettingsList({ onReplay }: { onReplay: () => void }) {
  return <section className="profile-options guest-options"><button type="button" onClick={onReplay}><span><Sparkles size={18} /><span><b>Replay welcome tour</b><small>See how CampusFind works</small></span></span><ChevronRight size={17} /></button><button type="button"><span><CircleHelp size={18} /><span><b>Help & safety</b><small>Reporting and handover guidance</small></span></span><ChevronRight size={17} /></button></section>;
}

function AdminView({ session, showToast, onBack }: { session: ApiSession | null; showToast: (message: string) => void; onBack: () => void }) {
  const [claims, setClaims] = useState<ApiAdminClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewing, setReviewing] = useState<{ id: string; status: "approved" | "rejected" | "more_evidence" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [evidenceUrls, setEvidenceUrls] = useState<Record<string, string>>({});
  const [loadingEvidence, setLoadingEvidence] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !apiConfigured || session.token === "campusfind-demo-session") return;
    let active = true;
    void listAdminClaims(session.token).then((items) => {
      if (active) setClaims(items);
    }).catch((issue) => {
      if (active) setError(issue instanceof Error ? issue.message : "The claim queue could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [session]);

  async function submitDecision(event: FormEvent<HTMLFormElement>, claim: ApiAdminClaim) {
    event.preventDefault();
    if (!session || !reviewing) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const reviewNote = String(form.get("reviewNote") || "").trim();
    const handoverPoint = String(form.get("handoverPoint") || "").trim();
    const scheduledFor = String(form.get("scheduledFor") || "");
    try {
      await reviewClaim(session.token, claim._id, {
        status: reviewing.status,
        reviewNote,
        ...(reviewing.status === "approved" ? { handoverPoint, scheduledFor: new Date(scheduledFor).toISOString() } : {}),
      });
      setClaims((items) => items.map((item) => item._id === claim._id ? { ...item, status: reviewing.status } : item));
      setReviewing(null);
      showToast(reviewing.status === "approved" ? "Claim approved and handover scheduled" : reviewing.status === "rejected" ? "Claim rejected" : "More evidence requested");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "The review decision could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function prepareEvidenceLink(claimId: string, index: number) {
    if (!session) return;
    const key = `${claimId}:${index}`;
    setLoadingEvidence(key);
    setError("");
    try {
      const result = await getClaimEvidenceUrl(session.token, claimId, index);
      setEvidenceUrls((current) => ({ ...current, [key]: result.url }));
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "The private evidence link could not be created.");
    } finally {
      setLoadingEvidence(null);
    }
  }

  const pendingCount = claims.filter((claim) => claim.status === "pending" || claim.status === "more_evidence").length;
  if (!session || !apiConfigured || session.token === "campusfind-demo-session") {
    return <main className="mobile-page admin-page"><CompactHeader title="Review centre" onBack={onBack} /><div className="empty-workflow"><span><ShieldCheck size={24} /></span><h1>Administrator sign-in required</h1><p>Sign in with an authorised CampusFind administrator account to review private claims.</p><button type="button" className="primary-app-button" onClick={onBack}>Back to account</button></div></main>;
  }

  return <main className="mobile-page admin-page">
    <CompactHeader title="Review centre" onBack={onBack} />
    <section className="admin-summary"><p className="micro-label">Institution review queue</p><h1>{pendingCount ? `${pendingCount} claim${pendingCount === 1 ? "" : "s"} need attention.` : "No claims need attention."}</h1><div><span><strong>{claims.filter((claim) => claim.status === "pending").length}</strong><small>New review</small></span><span><strong>{claims.filter((claim) => claim.status === "more_evidence").length}</strong><small>Follow-up</small></span><span><strong>{claims.length}</strong><small>Open cases</small></span></div></section>
    {error && <p className="workflow-error" role="alert">{error}</p>}
    {loading ? <p className="workflow-note">Loading the institution claim queue…</p> : claims.length === 0 ? <p className="workflow-note">There are no submitted claims to review.</p> : claims.map((claim) => {
      const isActionable = claim.status === "pending" || claim.status === "more_evidence";
      const isReviewing = reviewing?.id === claim._id;
      const itemTitle = claim.match.foundReport.title || claim.match.lostReport.title;
      return <article className="admin-claim" key={claim._id}>
        <div><span className="mini-avatar">{claim.claimant.fullName.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><span><small>Submitted {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(claim.createdAt))}</small><strong>{itemTitle}</strong><p>{claim.claimant.fullName} · {claim.claimant.matricNumber} · {claim.match.score}% suggested match</p></span></div>
        <section className="admin-evidence">
          <b>Private ownership answer</b><p>{claim.privateDetail}</p>
          {claim.match.foundReport.privateDetails && <><b>Finder’s verification detail</b><p>{claim.match.foundReport.privateDetails}</p></>}
          {claim.proofCount ? <div className="admin-proof-list"><b>Private attachments</b>{Array.from({ length: claim.proofCount }, (_, index) => {
            const evidenceKey = `${claim._id}:${index}`;
            const url = evidenceUrls[evidenceKey];
            return url
              ? <a key={evidenceKey} href={url} target="_blank" rel="noreferrer">Open evidence {index + 1} (expires in 5 min)</a>
              : <button key={evidenceKey} type="button" disabled={loadingEvidence === evidenceKey} onClick={() => void prepareEvidenceLink(claim._id, index)}>{loadingEvidence === evidenceKey ? "Preparing…" : `Prepare secure link for evidence ${index + 1}`}</button>;
          })}</div> : null}
          {claim.evidenceHistory?.length ? <details><summary>{claim.evidenceHistory.length} previous answer{claim.evidenceHistory.length === 1 ? "" : "s"}</summary>{claim.evidenceHistory.map((version, index) => <p key={`${claim._id}-evidence-${index}`}>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(version.submittedAt))}: {version.privateDetail}</p>)}</details> : null}
        </section>
        {isActionable ? <>
          {!isReviewing ? <div className="admin-actions"><button type="button" className="approve-small" onClick={() => setReviewing({ id: claim._id, status: "approved" })}><Check size={15} />Approve</button><button type="button" className="review-small" onClick={() => setReviewing({ id: claim._id, status: "more_evidence" })}>Request evidence</button><button type="button" className="review-small" onClick={() => setReviewing({ id: claim._id, status: "rejected" })}>Reject</button></div> : <form className="admin-review-form" onSubmit={(event) => void submitDecision(event, claim)}>
            <p className="admin-review-heading">{reviewing.status === "approved" ? "Approve and arrange handover" : reviewing.status === "rejected" ? "Reject this claim" : "Request more evidence"}</p>
            <label><span>Decision reason</span><textarea name="reviewNote" minLength={3} maxLength={1000} rows={3} required placeholder="Record the reason for this decision" /></label>
            {reviewing.status === "approved" && <><label><span>Handover point</span><input name="handoverPoint" minLength={3} maxLength={150} required placeholder="University security office" /></label><label><span>Scheduled date and time</span><input name="scheduledFor" type="datetime-local" required /></label></>}
            <div className="admin-actions"><button type="submit" className="approve-small" disabled={busy}>{busy ? "Saving…" : "Save decision"}</button><button type="button" className="review-small" disabled={busy} onClick={() => setReviewing(null)}>Cancel</button></div>
          </form>}
        </> : <div className="admin-status">Decision recorded: <strong>{claim.status.replace("_", " ")}</strong></div>}
      </article>;
    })}
  </main>;
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

function AuthSheet({ reason, onClose, onAuthenticated, onOAuth, onResetRequest, onResetPassword, onResendVerification, onVerifyEmail }: {
  reason: AuthReason;
  onClose: () => void;
  onAuthenticated: (session: ApiSession) => Promise<void>;
  onOAuth: (provider: "google" | "apple") => Promise<void>;
  onResetRequest: (email: string) => Promise<void>;
  onResetPassword: (input: { email: string; code: string; password: string }) => Promise<void>;
  onResendVerification: (email: string) => Promise<void>;
  onVerifyEmail: (input: { email: string; code: string }) => Promise<void>;
}) {
  const [mode, setMode] = useState<AuthMode>("options");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [universities, setUniversities] = useState<ApiUniversity[]>([]);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [resetCodeSent, setResetCodeSent] = useState(false);

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
      if (!apiConfigured) {
        const session = demoSession(String(form.get("fullName") || "Demo Student"), String(form.get("email") || "demo.student@example.edu"));
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        await onAuthenticated(session);
      } else if (mode === "signin") {
        await onAuthenticated(await login({ email: String(form.get("email")), password: String(form.get("password")) }));
      } else {
        const universityId = String(form.get("universityId") || universities[0]?._id || "");
        const result = await register({ fullName: String(form.get("fullName")), email: String(form.get("email")), matricNumber: String(form.get("matricNumber")), password: String(form.get("password")), universityId });
        setVerificationEmail(result.email);
        setMode("verify");
      }
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "We could not complete sign-in.");
    } finally {
      setLoading(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await onVerifyEmail({ email: verificationEmail, code: String(form.get("code") || "") });
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "We could not verify this email.");
    } finally {
      setLoading(false);
    }
  }

  async function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "");
    try {
      if (!resetCodeSent) {
        await onResetRequest(email);
        setVerificationEmail(email);
        setResetCodeSent(true);
      } else {
        await onResetPassword({ email: verificationEmail, code: String(form.get("code") || ""), password: String(form.get("password") || "") });
        setMode("signin");
        setResetCodeSent(false);
        setError("Password updated. Sign in with your new password.");
      }
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "The password reset could not be completed.");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setLoading(true);
    setError("");
    try { await onResendVerification(verificationEmail); setError("A new verification code was sent."); }
    catch (issue) { setError(issue instanceof Error ? issue.message : "A new code could not be sent."); }
    finally { setLoading(false); }
  }

  const title = mode === "options" ? "Join to continue" : mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : mode === "verify" ? "Verify your school email" : "Reset your password";
  return <div className="sheet-layer" role="dialog" aria-modal="true" aria-label="Sign in to CampusFind">
    <button type="button" className="sheet-scrim" aria-label="Close sign in" onClick={onClose} />
    <section className="auth-sheet">
      <span className="sheet-handle" />
      <div className="sheet-heading"><div><Mark compact /><span><small>CampusFind</small><b>{title}</b></span></div><button type="button" onClick={onClose}><X size={19} /></button></div>
      {mode === "options" && <>
        <p className="auth-reason">{reasonCopy}</p>
        {apiConfigured && <>
          <button type="button" className="social-auth-button" disabled={loading} onClick={() => void onOAuth("google")}>G <span>Continue with Google</span></button>
          <button type="button" className="apple-button" disabled={loading} onClick={() => void onOAuth("apple")}><span aria-hidden="true"></span>Continue with Apple</button>
          <div className="auth-divider"><span />or<span /></div>
        </>}
        <button type="button" className="email-button" onClick={() => setMode("signup")}><Mail size={18} />Continue with email</button>
        <button type="button" className="existing-link" onClick={() => setMode("signin")}>Already have an account? <b>Sign in</b></button>
        <p className="guest-note"><ShieldCheck size={15} />You may browse CampusFind without an account.</p>
      </>}
      {mode === "verify" && <form className="auth-form" onSubmit={(event) => void verify(event)}>
        <p className="auth-reason">Enter the six-digit code sent to {verificationEmail}.</p>
        <label><span>Verification code</span><input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required placeholder="000000" /></label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" className="primary-app-button" disabled={loading}>{loading ? "Checking…" : "Verify email"}<ArrowRight size={17} /></button>
        <button type="button" className="back-to-options" disabled={loading} onClick={() => void resend()}>Resend code</button>
      </form>}
      {mode === "reset" && <form className="auth-form" onSubmit={(event) => void reset(event)}>
        {!resetCodeSent ? <label><span>School email</span><input name="email" type="email" required placeholder="you@ui.edu.ng" /></label> : <>
          <p className="auth-reason">Enter the code sent to {verificationEmail} and choose a new password.</p>
          <input type="hidden" name="email" value={verificationEmail} />
          <label><span>Reset code</span><input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required placeholder="000000" /></label>
          <label><span>New password</span><input name="password" type="password" minLength={8} required placeholder="At least 8 characters" /></label>
        </>}
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" className="primary-app-button" disabled={loading}>{loading ? "Please wait…" : resetCodeSent ? "Update password" : "Send reset code"}<ArrowRight size={17} /></button>
        <button type="button" className="back-to-options" onClick={() => { setMode("signin"); setResetCodeSent(false); setError(""); }}><ArrowLeft size={15} />Back to sign in</button>
      </form>}
      {(mode === "signin" || mode === "signup") && <>
        {mode === "signup" && apiConfigured && <div className="social-auth-row"><button type="button" className="social-auth-button" disabled={loading} onClick={() => void onOAuth("google")}>G <span>Google</span></button><button type="button" className="apple-button" disabled={loading} onClick={() => void onOAuth("apple")}> <span>Apple</span></button></div>}
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          {mode === "signup" && <><label><span>Full name</span><input name="fullName" required placeholder="Your full name" /></label><label><span>Matric number</span><input name="matricNumber" required placeholder="UI-DEMO-001" /></label>{apiConfigured && <label><span>University</span><select name="universityId" required defaultValue=""><option value="" disabled>Choose your university</option>{universities.map((university) => <option key={university._id} value={university._id}>{university.name}</option>)}</select></label>}</>}
          <label><span>School email</span><input name="email" type="email" required placeholder="you@ui.edu.ng" /></label>
          <label><span>Password</span><input name="password" type="password" minLength={8} required placeholder="At least 8 characters" /></label>
          {mode === "signin" && <button type="button" className="forgot-password" onClick={() => { setMode("reset"); setResetCodeSent(false); setError(""); }}>Forgot password?</button>}
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="primary-app-button" disabled={loading}>{loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}<ArrowRight size={17} /></button>
          <button type="button" className="back-to-options" onClick={() => { setMode("options"); setError(""); }}><ArrowLeft size={15} />Other sign-in options</button>
          {mode === "signup" && <p className="auth-terms">By continuing, you agree to the CampusFind safety and privacy rules.</p>}
        </form>
      </>}
    </section>
  </div>;
}
