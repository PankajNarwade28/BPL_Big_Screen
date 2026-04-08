import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import LoadingAnimation from "./LoadingAnimation";
import TeamPurseBar from "./TeamPurseBar";

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:5000/";
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

// Ensure SOCKET_URL ends with a slash
const normalizeUrl = (url) => (url.endsWith("/") ? url : url + "/");
const BASE_URL = normalizeUrl(SOCKET_URL);

const PLACEHOLDER_IMAGE =
  "https://res.cloudinary.com/dz8q0fb8m/image/upload/v1772197979/defaultPlayer_kad3xb.png";
const DEFAULT_TEAM_LOGO =
  "https://res.cloudinary.com/dz8q0fb8m/image/upload/v1772197980/defaultTeam_x7thxe.png";

const buildImgUrl = (path, base, placeholder) => {
  if (!path || path.trim() === "") return placeholder;

  // If it's a Cloudinary URL, return as-is (we'll optimize at usage points)
  if (path.startsWith("http")) return path;

  // Normalize base URL to ensure it has protocol and trailing slash
  let normalizedBase = base;
  if (!normalizedBase.startsWith("http")) {
    normalizedBase = "http://localhost:5000/";
  }
  normalizedBase = normalizedBase.endsWith("/")
    ? normalizedBase
    : normalizedBase + "/";

  // Clean the path - remove leading slashes
  const cleanPath = path.replace(/^\/+/, "");

  // Construct the full URL
  return `${normalizedBase}${cleanPath}`;
};

// Helper function to get optimized player photo
const getOptimizedPlayerPhoto = (photoUrl) => {
  if (!photoUrl) return PLACEHOLDER_IMAGE;

  // If it's already a full URL (Cloudinary or other), use it as-is
  if (photoUrl.startsWith("http")) {
    return photoUrl;
  }

  // For local uploads, use buildImgUrl
  return buildImgUrl(photoUrl, BASE_URL, PLACEHOLDER_IMAGE);
};

// Helper function to get optimized team logo
const getOptimizedTeamLogo = (logoUrl) => {
  if (!logoUrl) return DEFAULT_TEAM_LOGO;

  // If it's already a full URL (Cloudinary or other), use it as-is
  if (logoUrl.startsWith("http")) {
    return logoUrl;
  }

  // For local uploads, use buildImgUrl
  return buildImgUrl(logoUrl, BASE_URL, DEFAULT_TEAM_LOGO);
};

const playAudioFromStart = (audioRef, onBlocked) => {
  const audio = audioRef?.current;
  if (!audio) return;

  try {
    audio.pause();
    audio.currentTime = 0;
    const playPromise = audio.play();

    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch((error) => {
        if (error?.name === "NotAllowedError") {
          onBlocked?.();
          return;
        }

        // Rapid retriggers can interrupt playback in some browsers.
        audio.load();
        audio.currentTime = 0;
        audio.play().catch((retryError) => {
          if (retryError?.name === "NotAllowedError") {
            onBlocked?.();
          }
        });
      });
    }
  } catch {
    // Audio failures should not break the auction screen.
  }
};

// Only return stats that have a real, non-zero value
const getVisibleStats = (stats) => {
  if (!stats) return [];
  return [
    { label: "Matches", val: stats.matches },
    { label: "Runs", val: stats.runs },
    { label: "Wickets", val: stats.wickets },
    { label: "Average", val: stats.average },
    { label: "Strike Rate", val: stats.strikeRate },
  ].filter(
    (s) => s.val !== undefined && s.val !== null && s.val !== "" && s.val !== 0,
  );
};

export default function App() {
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [timerValue, setTimerValue] = useState(20);
  const [currentBid, setCurrentBid] = useState({
    amount: 5,
    teamName: "No Bids Yet",
    team: null,
  });
  const [recentlySold, setRecentlySold] = useState([]);
  const [showSoldAnimation, setShowSoldAnimation] = useState(false);
  const [soldInfo, setSoldInfo] = useState(null);
  const soldAnimationTimeout = useRef(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [showBidAnimation, setShowBidAnimation] = useState(false);
  const [bidAnimationData, setBidAnimationData] = useState(null);
  const [showTeamSummary, setShowTeamSummary] = useState(false);
  const [teams, setTeams] = useState([]);
  const [setIntro, setSetIntro] = useState(null);        // { set, label, basePrice, players, totalPlayers, duration }
  const [setIntroCd, setSetIntroCd] = useState(30);     // countdown seconds
  const setIntroCdRef = useRef(null);                   // interval handle
  const bidSoundRef = useRef(null);
  const soldThemeRef = useRef(null);
  const countdownFiveSecRef = useRef(null);
  const lastTimerValueRef = useRef(20);
  const lastFiveCueActiveRef = useRef(false);
  const lastSoldTriggerRef = useRef({ key: null, time: 0 });

  const unlockAudioPlayback = () => {
    const audioRefs = [bidSoundRef, soldThemeRef, countdownFiveSecRef];

    audioRefs.forEach((ref) => {
      const audio = ref.current;
      if (!audio) return;

      const wasMuted = audio.muted;
      audio.muted = true;
      audio.currentTime = 0;

      const p = audio.play();
      if (p && typeof p.then === "function") {
        p
          .then(() => {
            audio.pause();
            audio.currentTime = 0;
            audio.muted = wasMuted;
          })
          .catch(() => {
            audio.muted = wasMuted;
          });
      } else {
        audio.muted = wasMuted;
      }
    });
  };

  useEffect(() => {
    const bidSound = new Audio(`${process.env.PUBLIC_URL}/assets/Bid_Sound.wav`);
    bidSound.preload = "auto";
    bidSound.volume = 1;
    bidSound.load();
    bidSoundRef.current = bidSound;

    return () => {
      if (bidSoundRef.current) {
        bidSoundRef.current.pause();
        bidSoundRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const soldTheme = new Audio(`${process.env.PUBLIC_URL}/assets/ipl_theme.mp3`);
    soldTheme.preload = "auto";
    soldTheme.volume = 0.9;
    soldTheme.load();
    soldThemeRef.current = soldTheme;

    return () => {
      if (soldThemeRef.current) {
        soldThemeRef.current.pause();
        soldThemeRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const fiveSecondsCue = new Audio(`${process.env.PUBLIC_URL}/assets/5-seconds.mp3`);
    fiveSecondsCue.preload = "auto";
    fiveSecondsCue.volume = 1;
    fiveSecondsCue.load();
    countdownFiveSecRef.current = fiveSecondsCue;

    return () => {
      if (countdownFiveSecRef.current) {
        countdownFiveSecRef.current.pause();
        countdownFiveSecRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handleUserUnlock = () => {
      unlockAudioPlayback();
    };

    window.addEventListener("pointerdown", handleUserUnlock, { once: true });
    window.addEventListener("keydown", handleUserUnlock, { once: true });

    return () => {
      window.removeEventListener("pointerdown", handleUserUnlock);
      window.removeEventListener("keydown", handleUserUnlock);
    };
  }, []);

  /* ── fetch teams ── */
  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const res = await fetch(`${API_URL}/teams`);
        if (res.ok) {
          const data = await res.json();
          if (data.teams && Array.isArray(data.teams)) setTeams(data.teams);
          else if (Array.isArray(data)) setTeams(data);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchTeams();
    const iv = setInterval(fetchTeams, 5000);
    return () => clearInterval(iv);
  }, []);

  /* ── socket ── */
  useEffect(() => {
    const resetLastFiveCountdownCue = () => {
      if (countdownFiveSecRef.current) {
        countdownFiveSecRef.current.pause();
        countdownFiveSecRef.current.currentTime = 0;
      }
      lastFiveCueActiveRef.current = false;
    };

    const updateTimerWithCue = (nextValue) => {
      const safeNext = Number.isFinite(nextValue) ? nextValue : 0;
      const prev = lastTimerValueRef.current;

      setTimerValue(safeNext);

      const enteredLastFive = prev > 5 && safeNext <= 5 && safeNext > 0;
      const leftLastFive = safeNext > 5 || safeNext <= 0;

      if (enteredLastFive && countdownFiveSecRef.current) {
        playAudioFromStart(countdownFiveSecRef);
        lastFiveCueActiveRef.current = true;
      } else if (leftLastFive && lastFiveCueActiveRef.current) {
        resetLastFiveCountdownCue();
      }

      lastTimerValueRef.current = safeNext;
    };

    const socket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socket.on("connect", () => {
      setTimeout(() => setIsConnecting(false), 1000);
      socket.emit("bigscreen:connect");
    });

    socket.on("auction:state", (data) => {
      if (!data.state) return;
      if (data.state.currentPlayer) {
        setCurrentPlayer(data.state.currentPlayer);
        setCurrentBid({
          amount: data.state.currentHighBid.amount,
          teamName: data.state.currentHighBid.team?.teamName || "No Bids Yet",
          team: data.state.currentHighBid.team || null,
        });
      } else setCurrentPlayer(null);
      if (data.state.recentlySold) setRecentlySold(data.state.recentlySold);
      updateTimerWithCue(data.timerValue ?? 20);
    });

    socket.on("auction:started", (data) => {
      if (soldAnimationTimeout.current)
        clearTimeout(soldAnimationTimeout.current);
      if (soldThemeRef.current) {
        soldThemeRef.current.pause();
        soldThemeRef.current.currentTime = 0;
      }
      setShowSoldAnimation(false);
      setCurrentPlayer(data.player);
      setCurrentBid({
        amount: data.basePrice,
        teamName: "Base Price",
        team: null,
      });
      updateTimerWithCue(data.timerValue ?? 20);
    });

    socket.on("bid:new", async (data) => {
      if (
        lastFiveCueActiveRef.current &&
        lastTimerValueRef.current <= 5 &&
        lastTimerValueRef.current > 0
      ) {
        resetLastFiveCountdownCue();
      }

      if (bidSoundRef.current) {
        playAudioFromStart(bidSoundRef);
      }

      let teamData = data.team;
      if (!teamData && data.teamId) {
        try {
          const res = await fetch(`${API_URL}/teams`);
          if (res.ok) {
            const result = await res.json();
            teamData = (result.teams || result).find(
              (t) => t._id === data.teamId,
            );
          }
        } catch (e) {
          console.error(e);
        }
      }
      setCurrentBid({
        amount: data.amount,
        teamName: data.teamName,
        team: teamData || null,
      });
      if (teamData || data.teamName) {
        const purse = teamData?.remainingPoints || teamData?.purseBudget || 0;
        setBidAnimationData({
          teamName: data.teamName,
          teamLogo: teamData?.logo || "",
          amount: data.amount,
          remainingPurse: purse - data.amount,
        });
        setShowBidAnimation(true);
        setTimeout(() => setShowBidAnimation(false), 2500);
      }
    });

    socket.on("timer:update", (d) => updateTimerWithCue(d.value));
    socket.on("timer:reset", (d) => updateTimerWithCue(d.value));
    socket.on("teams:status", (d) => {
      if (d.teams && Array.isArray(d.teams)) setTeams(d.teams);
    });

    socket.on("auction:reset", (data) => {
      // Reset auction state
      setCurrentPlayer(null);
      updateTimerWithCue(0);
      setShowSoldAnimation(false);
      setShowTeamSummary(false);
      lastSoldTriggerRef.current = { key: null, time: 0 };

      console.log("Auction reset:", data.message);
    });

    socket.on("player:sold", (data) => {
      const soldEventKey = [
        data?.player?._id || data?.player?.id || data?.player?.name || "unknown-player",
        data?.team?._id || data?.team?.id || "UNSOLD",
        data?.amount ?? "unknown-amount",
      ].join("|");
      const now = Date.now();

      // Ignore duplicate sold packets that can arrive from reconnect/replay.
      if (
        lastSoldTriggerRef.current.key === soldEventKey &&
        now - lastSoldTriggerRef.current.time < 8000
      ) {
        return;
      }
      lastSoldTriggerRef.current = { key: soldEventKey, time: now };

      if (soldAnimationTimeout.current)
        clearTimeout(soldAnimationTimeout.current);
      // Dismiss any active set intro when a player is sold
      if (setIntroCdRef.current) { clearInterval(setIntroCdRef.current); setIntroCdRef.current = null; }
      setSetIntro(null);
      setSoldInfo(data);
      setShowSoldAnimation(true);

      if (soldThemeRef.current) {
        playAudioFromStart(soldThemeRef);
      }

      socket.emit("bigscreen:summaryStarting");
      const t = setTimeout(() => {
        setShowSoldAnimation(false);
        soldAnimationTimeout.current = null;
        setShowTeamSummary(true);
        setTimeout(() => {
          setShowTeamSummary(false);
          socket.emit("bigscreen:summaryComplete");
        }, 10000);
      }, 5000);
      soldAnimationTimeout.current = t;
      if (data.team) {
        setRecentlySold((prev) => [
          {
            player: data.player,
            team: data.team,
            amount: data.amount,
            soldAt: new Date(),
          },
          ...prev.slice(0, 9),
        ]);
      }
    });

    socket.on("auction:ended", () => {
      setCurrentPlayer(null);
      updateTimerWithCue(0);
    });

    // ── Set intro events ──────────────────────────────────────────
    socket.on("set:intro", (data) => {
      if (setIntroCdRef.current) clearInterval(setIntroCdRef.current);
      setSetIntro(data);
      const secs = Math.round((data.duration || 30000) / 1000);
      setSetIntroCd(secs);
      setIntroCdRef.current = setInterval(() => {
        setSetIntroCd((prev) => {
          if (prev <= 1) { clearInterval(setIntroCdRef.current); setIntroCdRef.current = null; return 0; }
          return prev - 1;
        });
      }, 1000);
    });

    socket.on("set:started", () => {
      if (setIntroCdRef.current) { clearInterval(setIntroCdRef.current); setIntroCdRef.current = null; }
      setSetIntro(null);
    });

    socket.on("set:introAborted", () => {
      if (setIntroCdRef.current) { clearInterval(setIntroCdRef.current); setIntroCdRef.current = null; }
      setSetIntro(null);
    });

    return () => {
      if (soldAnimationTimeout.current)
        clearTimeout(soldAnimationTimeout.current);
      if (setIntroCdRef.current)
        clearInterval(setIntroCdRef.current);
      resetLastFiveCountdownCue();
      socket.close();
    };
  }, []);

  /* ── timer colour ── */
  const timerRing =
    timerValue > 15
      ? "border-emerald-400 bg-emerald-50"
      : timerValue > 5
        ? "border-amber-400 bg-amber-50"
        : "border-red-400 bg-red-50";
  const timerText =
    timerValue > 15
      ? "text-emerald-600"
      : timerValue > 5
        ? "text-amber-600"
        : "text-red-600";

  const setIntroKey = setIntro?.set?.toUpperCase();
  const setIntroThemes = {
    APP: {
      bg: "bg-gradient-to-br from-fuchsia-600 via-purple-700 to-violet-900",
      text: "text-fuchsia-200",
    },
    A: {
      bg: "bg-gradient-to-br from-amber-500 via-orange-600 to-red-700",
      text: "text-yellow-200",
    },
    B: {
      bg: "bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-700",
      text: "text-sky-200",
    },
    C: {
      bg: "bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700",
      text: "text-emerald-200",
    },
    DEFAULT: {
      bg: "bg-gradient-to-br from-slate-600 via-slate-700 to-slate-900",
      text: "text-slate-200",
    },
  };
  const setIntroDisplaySet = setIntroKey === "APP" ? "A++" : setIntro?.set;
  const setIntroTheme = setIntroThemes[setIntroKey] || setIntroThemes.DEFAULT;

  return (
    <div className="h-screen min-h-screen overflow-hidden flex flex-col bg-slate-50 text-slate-900">
      {/* Animation keyframes — only motion, no layout/colour */}
      <style>{`
        @keyframes sold-slam { 0%{transform:scale(.65) translateY(20px);opacity:0} 65%{transform:scale(1.04) translateY(-4px);opacity:1} 100%{transform:scale(1) translateY(0);opacity:1} }
        @keyframes bid-pop   { 0%{transform:translateY(64px) scale(.9);opacity:0} 60%{transform:translateY(-5px) scale(1.02);opacity:1} 100%{transform:translateY(0) scale(1);opacity:1} }
        @keyframes fade-up   { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes blink     { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes beat      { 0%,100%{transform:scale(1)} 50%{transform:scale(1.07)} }
        @keyframes prog      { from{width:100%} to{width:0%} }
        .anim-sold { animation: sold-slam .55s cubic-bezier(.34,1.4,.64,1) forwards }
        .anim-bid  { animation: bid-pop   .45s cubic-bezier(.34,1.4,.64,1) forwards }
        .anim-up   { animation: fade-up   .4s ease forwards }
        .anim-live { animation: blink 1.4s ease infinite }
        .anim-beat { animation: beat  .65s ease infinite }
        .anim-prog { animation: prog  10s linear forwards }
        .no-sb::-webkit-scrollbar            { display:none }
        .no-sb                               { scrollbar-width:none; -ms-overflow-style:none }
        .thin-sb::-webkit-scrollbar          { width:3px }
        .thin-sb::-webkit-scrollbar-thumb    { background:#CBD5E1; border-radius:6px }
        .thin-sb::-webkit-scrollbar-track    { background:transparent }
      `}</style>

      {isConnecting && <LoadingAnimation message="Establishing Connection…" />}

      {/* ════════════════════════════════════
          SET INTRO OVERLAY (30 s)
      ════════════════════════════════════ */}
      {setIntro && (
        <div className={`fixed inset-0 z-[2000] flex flex-col overflow-hidden ${setIntroTheme.bg}`}>

          {/* Top bar */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 bg-black/20 backdrop-blur-sm">
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="text-white/50 text-xs font-bold uppercase tracking-widest hidden sm:block">Auto Auction</span>
              <span className="text-white/30 hidden sm:block">•</span>
              <span className="text-white/70 text-xs sm:text-sm font-bold uppercase tracking-wide">Up Next</span>
            </div>
            <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-3 sm:px-4 py-1.5 sm:py-2 border border-white/20">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              <span className="text-white font-bold text-xs sm:text-sm">Starts in {setIntroCd}s</span>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-3 sm:gap-4 p-3 sm:p-4 md:p-5 min-h-0">

            {/* Left —— set identity */}
            <div className="flex-shrink-0 flex flex-col items-center justify-center lg:w-56 xl:w-72 gap-4">
              <div className="w-full bg-white/10 backdrop-blur-md rounded-2xl sm:rounded-3xl p-4 sm:p-6 text-center border border-white/20 shadow-2xl">
                <p className="text-white/50 text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-1">Now Entering</p>
                <div className={`text-7xl sm:text-8xl lg:text-9xl font-black text-white leading-none drop-shadow-lg ${setIntroTheme.text}`}>
                  {setIntroDisplaySet}
                </div>
                <p className="text-xl sm:text-2xl lg:text-3xl font-black text-white/90 mt-1">{setIntro.label}</p>
                <div className="mt-3 sm:mt-4 bg-white/15 rounded-xl sm:rounded-2xl px-4 py-2.5 sm:py-3">
                  <p className="text-white/60 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-0.5">Base Price</p>
                  <p className="text-2xl sm:text-3xl lg:text-4xl font-black text-white">₹{setIntro.basePrice}L</p>
                </div>
                <p className="mt-3 text-white/70 text-xs sm:text-sm">
                  <span className="font-black text-white text-base sm:text-lg">{setIntro.totalPlayers}</span> Players
                </p>
              </div>

              {/* Countdown ring */}
              <div className="flex flex-col items-center gap-1.5">
                <div className="relative w-20 h-20 sm:w-24 sm:h-24">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="8" />
                    <circle
                      cx="50" cy="50" r="44" fill="none"
                      stroke="rgba(255,255,255,0.7)" strokeWidth="8"
                      strokeDasharray={`${2 * Math.PI * 44}`}
                      strokeDashoffset={`${2 * Math.PI * 44 * (1 - setIntroCd / 30)}`}
                      strokeLinecap="round"
                      style={{ transition: 'stroke-dashoffset 1s linear' }}
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-2xl sm:text-3xl font-black text-white">{setIntroCd}</span>
                </div>
                <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest">Seconds</p>
              </div>
            </div>

            {/* Right —— player grid */}
            <div className="flex-1 overflow-y-auto thin-sb min-h-0">
              <p className="text-white/60 text-xs font-bold uppercase tracking-wider mb-2 sm:mb-3">Players in this set</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2 sm:gap-3">
                {setIntro.players.map((player) => (
                  <div
                    key={player._id}
                    className="bg-white/10 backdrop-blur-sm rounded-xl sm:rounded-2xl p-2.5 sm:p-3 border border-white/20 flex flex-col items-center gap-1.5 sm:gap-2 hover:bg-white/20 transition-colors"
                  >
                    <img
                      src={getOptimizedPlayerPhoto(player.photo)}
                      alt={player.name}
                      onError={(e) => { e.target.onerror = null; e.target.src = PLACEHOLDER_IMAGE; }}
                      className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg sm:rounded-xl object-cover border-2 border-white/30 shadow-lg flex-shrink-0"
                    />
                    <div className="text-center w-full">
                      <p className="text-white font-bold text-[11px] sm:text-xs leading-tight line-clamp-2">{player.name}</p>
                      <p className="text-white/55 text-[9px] sm:text-[10px] mt-0.5">{player.category}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Progress bar at bottom */}
          <div className="flex-shrink-0 h-1.5 bg-black/20">
            <div
              className="h-full bg-white/60"
              style={{ width: `${(setIntroCd / 30) * 100}%`, transition: 'width 1s linear' }}
            />
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          SOLD / UNSOLD SCREEN
      ══════════════════════════════════════ */}
      {showSoldAnimation && soldInfo ? (
       <div
  className="fixed inset-0 z-[1000] flex items-center justify-center p-6 sm:p-10 lg:p-16 backdrop-blur-xl bg-slate-950/60 transition-all duration-1000"
>
  {/* The Main Container: Handles responsive sizing and centering */}
  <div className="relative w-full max-w-lg flex flex-col items-center animate-in fade-in zoom-in duration-500">
    
    {/* Floating Header: High Contrast for visual impact */}
    <div className="relative z-20 -mb-6 sm:-mb-10 transform -rotate-1">
      <h1
        className={`font-black uppercase tracking-tighter drop-shadow-[0_20px_20px_rgba(0,0,0,0.5)]
        text-7xl sm:text-8xl md:text-9xl
        ${soldInfo.team 
          ? "text-transparent bg-clip-text bg-gradient-to-b from-yellow-100 via-yellow-400 to-amber-600 italic" 
          : "text-slate-400 opacity-90"}`}
      >
        {soldInfo.team ? "SOLD!" : "UNSOLD"}
      </h1>
    </div>

    {/* The Card: Centered with internal spacing */}
    <div className={`w-full rounded-[3rem] shadow-[0_40px_80px_-15px_rgba(0,0,0,0.7)] border-t border-white/20 p-8 sm:p-12 text-center
      ${soldInfo.team 
        ? "bg-gradient-to-br from-emerald-900/90 via-teal-950/95 to-slate-950/95" 
        : "bg-gradient-to-br from-slate-800/90 to-slate-950/95"}`}
    >
      
      {/* Player Profile Image */}
      <div className="relative inline-block mb-8">
        <div className={`absolute inset-0 blur-3xl opacity-40 rounded-full animate-pulse
          ${soldInfo.team ? "bg-yellow-400" : "bg-slate-400"}`}></div>
        <img
          src={getOptimizedPlayerPhoto(soldInfo.player.photo)}
          onError={(e) => (e.target.src = PLACEHOLDER_IMAGE)}
          alt={soldInfo.player.name}
          className="relative w-36 h-36 sm:w-48 sm:h-48 rounded-[2.5rem] object-cover border-4 border-white/10 shadow-2xl z-10"
        />
      </div>

      {/* Name and Meta */}
      <div className="mb-8">
        <h2 className="text-3xl sm:text-5xl font-black text-white mb-2 tracking-tight">
          {soldInfo.player.name}
        </h2>
        <div className="h-1 w-12 bg-yellow-500 mx-auto rounded-full opacity-60"></div>
      </div>

      {/* Team Info Section */}
      {soldInfo.team && (
        <div className="flex items-center justify-between gap-4 bg-white/5 border border-white/10 rounded-3xl p-5 mb-8 text-left">
          <div className="flex flex-col">
            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-[0.2em] mb-1">Purchased By</p>
            <span className="text-xl sm:text-2xl font-black text-white truncate max-w-[140px] sm:max-w-[200px]">
              {soldInfo.team.teamName}
            </span>
          </div>
          <img
            src={getOptimizedTeamLogo(soldInfo.team.logo)}
            onError={(e) => (e.target.src = DEFAULT_TEAM_LOGO)}
            alt={soldInfo.team.teamName}
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-contain bg-white/10 p-2 border border-white/10 shadow-lg"
          />
        </div>
      )}

      {/* Price Badge */}
      <div className={`inline-flex flex-col items-center justify-center rounded-2xl px-12 py-5 shadow-2xl
        ${soldInfo.team 
          ? "bg-white text-slate-900 shadow-emerald-500/20" 
          : "bg-slate-700 text-slate-300 shadow-black"}`}>
        <div className="flex items-baseline gap-1">
           <span className="text-xl font-bold">₹</span>
           <span className="text-5xl sm:text-6xl font-black tabular-nums tracking-tighter">
             {soldInfo.amount.toLocaleString('en-IN')}
           </span>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-[0.3em] mt-1 opacity-60">Points</span>
      </div>
    </div>

    {/* Branding Footnote */}
    <div className="mt-8 flex items-center gap-3 opacity-40">
       <span className="h-px w-8 bg-white"></span>
       <p className="text-[10px] text-white font-bold uppercase tracking-widest">
         Dev: Pankaj Narwade
       </p>
       <span className="h-px w-8 bg-white"></span>
    </div>
  </div>
</div>
      ) : /* ══════════════════════════════════════
          MAIN AUCTION VIEW
      ══════════════════════════════════════ */
      currentPlayer ? (
        <div className="flex flex-col h-full overflow-hidden relative">
          {/* Header */}
          <header className="flex-shrink-0 bg-white border-b border-slate-200 shadow-sm z-10">
            <div className="flex items-center justify-between px-4 py-2.5 sm:px-6 sm:py-3">
              <div className="flex items-center gap-2">
                <span className="text-xl" aria-hidden>
                  🏏
                </span>
                <span className="text-sm sm:text-base md:text-lg font-black tracking-widest text-slate-800 uppercase">
                  Cricket Auction
                </span>
              </div>
              <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-600 px-2.5 py-1 rounded-full">
                <span className="anim-live block w-1.5 h-1.5 rounded-full bg-red-500" />
                <span className="text-[10px] sm:text-xs font-bold tracking-widest uppercase">
                  Live
                </span>
              </div>
            </div>
          </header>

          {/* Body — stacks vertically on mobile, side-by-side on lg+ */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-2 p-2 sm:gap-3 sm:p-3 md:gap-4 md:p-4">
            {/* ── Player Card ── */}
            <div className="anim-up bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-md flex flex-col items-center justify-center p-3 sm:p-4 md:p-6 overflow-auto no-sb">
              {/* Photo */}
              <img
                src={getOptimizedPlayerPhoto(currentPlayer.photo)}
                onError={(e) => (e.target.src = PLACEHOLDER_IMAGE)}
                alt={currentPlayer.name}
                className="w-20 h-20 sm:w-28 sm:h-28 md:w-36 md:h-36 lg:size-[20rem] rounded-xl sm:rounded-2xl object-cover
                           border-2 border-slate-100 shadow-lg mb-2 sm:mb-3 md:mb-4 flex-shrink-0"
              />

              {/* Name */}
              <h2 className="text-lg sm:text-2xl md:text-3xl lg:text-4xl font-black text-slate-900 text-center leading-tight mb-1 sm:mb-2">
                {currentPlayer.name}
              </h2>

              {/* Category */}
              {currentPlayer.category && (
                <span
                  className="text-[9px] sm:text-[10px] md:text-xs font-bold tracking-widest uppercase
                                 bg-blue-50 text-blue-600 border border-blue-200
                                 px-2 sm:px-3 md:px-4 py-0.5 sm:py-1 rounded-full mb-2 sm:mb-3 md:mb-5"
                >
                  {currentPlayer.category}
                </span>
              )}

              {/* Stats — only rendered when ≥1 stat exists */}
              {(() => {
                const stats = getVisibleStats(currentPlayer.stats);
                if (stats.length === 0) return null;
                return (
                  <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2 w-full">
                    {stats.map((s, i) => (
                      <div
                        key={i}
                        className="flex-1 min-w-[56px] max-w-[90px]
                                              bg-slate-50 border border-slate-200
                                              rounded-lg sm:rounded-xl p-1.5 sm:p-2 md:p-3 text-center"
                      >
                        <p className="text-[8px] sm:text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 sm:mb-1">
                          {s.label}
                        </p>
                        <p className="text-xs sm:text-sm md:text-xl lg:text-2xl font-black text-slate-800 leading-none">
                          {s.val}
                        </p>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* ── Timer + Bid ── */}
            <div
              className="anim-up bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-md
                            flex flex-col items-center justify-center gap-2 sm:gap-3 md:gap-4 p-3 sm:p-4 md:p-6 overflow-hidden"
            >
              {/* Timer circle */}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`w-20 h-20 sm:w-28 sm:h-28 md:w-36 md:h-36 rounded-full border-4 flex items-center justify-center
                                 transition-all duration-300 ${timerRing} ${timerValue <= 5 ? "anim-beat" : ""}`}
                >
                  <span
                    className={`text-3xl sm:text-5xl md:text-6xl font-black leading-none transition-colors duration-300 ${timerText}`}
                  >
                    {timerValue}
                  </span>
                </div>
                <p className="text-[9px] sm:text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                  Seconds Left
                </p>
              </div>

              {/* Divider */}
              <div className="w-full h-px bg-slate-100" />

              {/* Bid box */}
              <div className="w-full bg-blue-50 border border-blue-200 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 md:p-5 text-center">
                <p className="text-[9px] sm:text-[10px] font-bold tracking-widest text-blue-400 uppercase mb-1">
                  Current Bid
                </p>
                <p className="text-2xl sm:text-4xl md:text-5xl font-black text-blue-700 leading-none mb-2 sm:mb-3">
                  ₹{currentBid.amount}
                </p>

                {/* Team chip */}
                <div
                  className="inline-flex items-center gap-1.5 sm:gap-2 bg-white border border-slate-200
                                rounded-full pl-1 sm:pl-1.5 pr-2 sm:pr-4 py-0.5 sm:py-1 shadow-sm max-w-full overflow-hidden"
                >
                  {currentBid.team && (
                    <img
                      src={getOptimizedTeamLogo(currentBid.team.logo)}
                      onError={(e) => (e.target.src = DEFAULT_TEAM_LOGO)}
                      alt={currentBid.team.teamName}
                      className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 rounded-full object-cover border border-slate-200 flex-shrink-0"
                    />
                  )}
                  <span className="text-xs sm:text-sm font-bold text-slate-700 truncate max-w-[120px] sm:max-w-[180px]">
                    {currentBid.teamName}
                  </span>
                </div>
              </div>

              {/* Base price */}
              <p className="text-[10px] sm:text-xs text-slate-400 font-medium">
                Base Price:{" "}
                <span className="text-slate-700 font-bold">
                  ₹{currentPlayer.basePrice}
                </span>
              </p>
            </div>
          </main>

          {/* ── Sold Gallery footer ── */}
          <footer className="flex-shrink-0 bg-white border-t border-slate-200 px-2 py-1.5 sm:px-3 sm:py-2 md:px-4 md:py-3">
            <p className="text-[8px] sm:text-[9px] font-black tracking-widest text-slate-400 uppercase mb-1 sm:mb-2">
              Sold Gallery
            </p>
            <div className="no-sb flex gap-1.5 sm:gap-2 overflow-x-auto pb-1">
              {recentlySold.length > 0 ? (
                recentlySold.map((item, i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 flex items-center gap-1.5 sm:gap-2
                                          bg-slate-50 border border-slate-200 rounded-lg sm:rounded-xl px-2 sm:px-3 py-1 sm:py-2"
                  >
                    <span className="text-[10px] sm:text-xs md:text-sm font-semibold text-slate-700 whitespace-nowrap">
                      {item.player?.name}
                    </span>
                    <div className="w-px h-2.5 sm:h-3 bg-slate-300" />
                    <span className="text-[10px] sm:text-xs md:text-sm font-black text-blue-600 whitespace-nowrap">
                      ₹{item.amount}
                    </span>
                    <span className="text-[9px] sm:text-[10px] font-bold bg-slate-200 text-slate-500 px-1.5 sm:px-2 py-0.5 rounded-md whitespace-nowrap">
                      {item.team?.teamName}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-[10px] sm:text-xs text-slate-300 italic px-1 py-1">
                  Awaiting first sale…
                </p>
              )}
            </div>
          </footer>
        </div>
      ) : (
        /* ══════════════════════════════════════
          LOBBY / WAITING SCREEN
      ══════════════════════════════════════ */
        <div
          className="flex flex-col items-center justify-center h-full gap-4
                        bg-gradient-to-b from-slate-50 to-slate-100 px-4"
        >
          <span
            className="text-7xl sm:text-8xl opacity-10 select-none"
            aria-hidden
          >
            🏏
          </span>
          <h1 className="text-lg sm:text-2xl font-black tracking-widest text-slate-300 uppercase text-center">
            Auction Lobby
          </h1>
          <div className="flex items-center gap-2">
            <span className="anim-live block w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-[10px] sm:text-xs font-bold tracking-widest text-slate-400 uppercase">
              Developed By Pankaj Narwade Patil
            </span>
          </div>
          {/* Developer Credit */}
          <div className="absolute bottom-4 right-4 text-[10px] text-slate-300 font-medium opacity-50">
            Developed By Pankaj Narwade
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
      BID NOTIFICATION TOAST (CENTERED & RESPONSIVE)
    ══════════════════════════════════════ */}
      {showBidAnimation && bidAnimationData && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 backdrop-blur-sm bg-black/20 pointer-events-none">
  <div
    className="anim-bid w-full max-w-sm md:max-w-2xl 
               bg-slate-900/95 backdrop-blur-2xl border border-white/10
               rounded-[2.5rem] md:rounded-[4rem] shadow-[0_0_80px_rgba(37,99,235,0.25)] 
               p-5 md:p-10 flex items-center gap-5 md:gap-10
               relative overflow-hidden pointer-events-auto"
  >
    {/* Background Animated Glow Line */}
    <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-blue-400 to-transparent animate-shimmer" />

    {/* Team Logo Section */}
    <div className="relative flex-shrink-0">
      {/* Pulse Aura */}
      <div className="absolute inset-0 bg-blue-500 rounded-full blur-xl animate-ping opacity-30" />
      
      <div className="relative z-10 p-1 bg-gradient-to-br from-white/20 to-transparent rounded-full">
        <img
          src={
            bidAnimationData.teamLogo
              ? getOptimizedTeamLogo(bidAnimationData.teamLogo)
              : DEFAULT_TEAM_LOGO
          }
          onError={(e) => (e.target.src = DEFAULT_TEAM_LOGO)}
          alt={bidAnimationData.teamName}
          className="w-20 h-20 md:w-36 md:h-36 rounded-full object-cover border-2 border-white/20 shadow-2xl"
        />
      </div>
    </div>

    {/* Bid Details Section */}
    <div className="min-w-0 flex-1 flex flex-col justify-center">
      {/* Live Badge */}
      <div className="flex items-center gap-2 mb-2">
        <span className="relative flex h-2 w-2 md:h-3 md:w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 md:h-3 md:w-3 bg-red-500"></span>
        </span>
        <p className="text-[10px] md:text-xs font-black tracking-[0.2em] text-blue-400 uppercase">
          Current High Bidder
        </p>
      </div>

      {/* Team Name */}
      <h2 className="text-2xl md:text-5xl font-black text-white truncate leading-tight uppercase italic tracking-tighter mb-1">
        {bidAnimationData.teamName}
      </h2>

      {/* Amount Display */}
      <div className="flex items-baseline gap-1 md:gap-3">
        <span className="text-xl md:text-4xl font-bold text-blue-500 italic">
          ₹
        </span>
        <p className="text-4xl md:text-8xl font-black text-white leading-none tracking-tighter tabular-nums drop-shadow-lg">
          {bidAnimationData.amount.toLocaleString('en-IN')}
        </p>
      </div>
    </div>

    {/* Vertical Decorative Text (Hidden on small mobile) */} 
<div className="hidden lg:flex absolute right-0 top-0 bottom-0 w-12 items-center justify-center border-l border-white/5 bg-white/[0.02]">
  <p className="text-[10px] font-black tracking-[1rem] text-white/20 uppercase whitespace-nowrap rotate-90 origin-center translate-x-1">
    AUCTION
  </p>
</div>

    {/* Custom Animations Inline */}
    <style jsx>{`
      @keyframes shimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }
      .animate-shimmer {
        animation: shimmer 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }
      .anim-bid {
        animation: popAndFloat 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      @keyframes popAndFloat {
        0% { opacity: 0; transform: scale(0.9) translateY(40px); }
        100% { opacity: 1; transform: scale(1) translateY(0); }
      }
    `}</style>
  </div>
</div>
      )}

      {/* ══════════════════════════════════════
          TEAM SUMMARY SCREEN
      ══════════════════════════════════════ */}
      {showTeamSummary && (
        <div className="fixed inset-0 bg-slate-50 z-[999] flex flex-col overflow-hidden">
          {/* Developer Credit */}
          <div className="fixed bottom-3 right-4 text-[9px] sm:text-[10px] text-slate-400 font-medium opacity-40 z-[1000]">
            Developed By Pankaj Narwade
          </div>

          {/* Header */}
          <div
            className="flex-shrink-0 flex items-center justify-between
                          px-2 py-2 sm:px-6 sm:py-4 bg-white border-b border-slate-200 shadow-sm"
          >
            <h1 className="text-xl sm:text-3xl md:text-4xl font-black tracking-tight text-slate-900">
              Squad Updates
            </h1>
            <div
              className="flex items-center gap-1.5 bg-blue-50 border border-blue-200
                            text-blue-600 px-3 py-1.5 rounded-full"
            >
              <span className="anim-live block w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-[10px] font-bold tracking-widest uppercase">
                Reviewing
              </span>
            </div>
          </div>

          {/* Teams grid */}
          <div className="no-sb flex-1 overflow-y-auto p-3 sm:p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-3 sm:gap-4">
              {Array.isArray(teams) &&
                teams.map((team) => (
                  <div
                    key={team._id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
                  >
                    {/* Team header */}
                    <div className="flex items-center gap-3 p-4 border-b border-slate-100">
                      <img
                        src={getOptimizedTeamLogo(team.logo)}
                        onError={(e) => (e.target.src = DEFAULT_TEAM_LOGO)}
                        alt={team.teamName}
                        className="w-11 h-11 rounded-full object-cover border border-slate-200 flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-black text-slate-800 text-base leading-tight truncate">
                          {team.teamName}
                        </p>
                        <p className="hidden sm:block text-sm font-bold text-blue-600">
                          ₹{team.purseBudget || 0} Purse
                        </p>
                      </div>
                    </div>

                    {/* Player slots */}
                    <div className="thin-sb p-3 max-h-64 lg:max-h-none overflow-y-auto lg:overflow-visible space-y-1.5">
                      {Array(11)
                        .fill(null)
                        .map((_, i) => {
                          const p = team.players?.[i];
                          return (
                            <div
                              key={i}
                              className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm
          ${
            p
              ? "bg-blue-50 border border-blue-100"
              : "bg-slate-50 border border-dashed border-slate-200 opacity-40"
          }`}
                            >
                              <span
                                className={`font-semibold truncate ${p ? "text-black-700" : "text-slate-400"}`}
                              >
                                {p ? p.name : `Slot ${i + 1}`}
                              </span>
                              {p && (
                                <span className="font-black text-blue-600 ml-2 flex-shrink-0">
                                  ₹{p.soldPrice}
                                </span>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Progress bar */}
          <div className="flex-shrink-0 h-1 bg-slate-200">
            <div className="anim-prog h-full bg-blue-500 rounded-full" />
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
      WAITING / IDLE SCREEN (when no auction active)
      ══════════════════════════════════════ */}
{!showSoldAnimation &&
  !showTeamSummary &&
  !isConnecting &&
  !currentPlayer && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617] overflow-hidden font-sans p-5">
      {/* 1. DYNAMIC BACKGROUND BEAMS */}
      <div className="absolute inset-0">
        <div className="stadium-light absolute top-[-5%] left-[-5%] w-[60vw] h-[60vw] bg-blue-600/10 rounded-full blur-[100px] animate-pulse" />
        <div
          className="stadium-light absolute bottom-[-5%] right-[-5%] w-[60vw] h-[60vw] bg-purple-600/10 rounded-full blur-[100px] animate-pulse"
          style={{ animationDelay: "2s" }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_49%,rgba(99,102,241,0.05)_50%,transparent_51%)] bg-[length:100%_4px] animate-scan" />
      </div>

      {/* 2. MAIN CONTENT CARD */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-[400px]">
        
        {/* Visual Focus: GIF Frame (Scaled down to 100px/80px) */}
        <div className="relative mb-8">
          <div className="absolute -inset-4 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-full opacity-20 blur-xl animate-pulse" />
          
          <div className="image-frame relative w-[100px] h-[100px] rounded-full overflow-hidden border-2 border-white/20 shadow-2xl bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-10">
            <img
              src="/assets/Untitled file.gif"
              alt="Cricket Animation"
              className="w-full h-full object-cover mix-blend-lighten scale-110"
              onError={(e) => { e.target.style.display = "none"; }}
            />
          </div>

          {/* Animated Tech Accents */}
          <div className="absolute -top-1 -left-1 w-5 h-5 border-t-2 border-l-2 border-blue-400 rounded-tl-lg" />
          <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-2 border-r-2 border-purple-400 rounded-br-lg" />
        </div>

        {/* 3. BRANDING & STATUS */}
        <div className="text-center w-full">
          <div className="mb-6">
            <h1 className="brand-title text-5xl font-black text-white tracking-tighter uppercase italic leading-none mb-2">
              Bittargon
            </h1>
            <p className="text-[11px] sm:text-xs font-bold tracking-[0.4em] text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 uppercase">
              Cricket Association
            </p>
          </div>

          {/* Status Box */}
          <div className="inline-flex flex-col items-center gap-3 py-4 px-6 w-full rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              <p className="text-sm sm:text-lg font-bold text-blue-100 italic tracking-widest">
                WAIT FOR NEXT PLAYER
              </p>
            </div>

            {/* Progress Bar */}
            <div className="w-32 h-1 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 animate-loading-bar" />
            </div>

            <p className="text-[9px] font-black tracking-[0.3em] text-white/40 uppercase">
              Auction Engine Standby
            </p>
          </div>
        </div>

        {/* 4. FOOTER STATS */}
        <div className="grid grid-cols-3 gap-2 border-t border-white/5 mt-8 pt-6 w-full">
          <div className="text-center">
            <p className="text-white/20 text-[8px] font-bold uppercase">Status</p>
            <p className="text-green-400 text-[10px] font-black">LIVE</p>
          </div>
          <div className="text-center">
            <p className="text-white/20 text-[8px] font-bold uppercase">Feed</p>
            <p className="text-white/70 text-[10px] font-black">SYNCED</p>
          </div>
          <div className="text-center">
            <p className="text-white/20 text-[8px] font-bold uppercase">Bidding</p>
            <p className="text-white/70 text-[10px] font-black">ACTIVE</p>
          </div>
        </div>
      </div>

      {/* 5. DEVELOPER SIGNATURE */}
      <div className="absolute bottom-6 text-center w-full left-0 px-4">
        <span className="text-[9px] text-white/20 font-bold tracking-[0.2em] uppercase">
          DEVELOPED BY 
          <span className="text-blue-500/50 ml-2">PANKAJ NARWADE PATIL</span>
        </span>
      </div>

      <style jsx>{`
        @keyframes scan {
          0% { background-position: 0 0; }
          100% { background-position: 0 100%; }
        }
        .animate-scan {
          animation: scan 10s linear infinite;
        }
        @keyframes loading-bar {
          0% { width: 0%; transform: translateX(0%); }
          50% { width: 100%; transform: translateX(0%); }
          100% { width: 0%; transform: translateX(100%); }
        }
        .animate-loading-bar {
          animation: loading-bar 2s cubic-bezier(0.65, 0, 0.35, 1) infinite;
        }

        /* Responsive Adjustments */
        @media (max-width: 480px) {
          .image-frame {
            width: 80px !important;
            height: 80px !important;
          }
          .brand-title {
            font-size: 2.5rem !important;
          }
          .stadium-light {
            width: 90vw !important;
            height: 90vw !important;
          }
        }
      `}</style>
    </div>
  )}

      {/* Team Purse Bar - Hidden on mobile */}
      {!showSoldAnimation && !showTeamSummary && currentPlayer && (
        <div className="hidden md:block">
          <TeamPurseBar teams={teams} socketUrl={SOCKET_URL} />
        </div>
      )}
    </div>
  );
}
