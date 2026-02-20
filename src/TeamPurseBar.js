import React from 'react';

const TeamPurseBar = ({ teams, socketUrl }) => {
  if (!teams || teams.length === 0) {
    return null;
  }

  // Sort teams alphabetically for consistent display
  const sortedTeams = [...teams].sort((a, b) => a.teamName.localeCompare(b.teamName));

  const getColorClass = (remainingPoints) => {
    if (remainingPoints <= 10) return 'bg-red-600';
    if (remainingPoints <= 30) return 'bg-orange-500';
    if (remainingPoints <= 60) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getBorderClass = (remainingPoints) => {
    if (remainingPoints <= 10) return 'border-red-400';
    if (remainingPoints <= 30) return 'border-orange-400';
    if (remainingPoints <= 60) return 'border-yellow-400';
    return 'border-green-400';
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t-2 border-slate-200 shadow-2xl z-50">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-6 overflow-x-auto no-scrollbar">
          {sortedTeams.map((team) => {
            const pursePercentage = (team.remainingPoints / 110) * 100;
            
            return (
              <div
                key={team._id}
                className={`flex items-center gap-3 bg-slate-50 rounded-2xl px-4 py-2 border-2 ${getBorderClass(team.remainingPoints)} flex-shrink-0 min-w-[200px] shadow-md hover:shadow-lg transition-all duration-200`}
              >
                {/* Team Logo */}
                {team.logo && (
                  <img 
                    src={team.logo.startsWith('http') ? team.logo : `${socketUrl}${team.logo.replace(/^\/+/, '').startsWith('uploads') ? team.logo.replace(/^\/+/, '') : 'uploads/' + team.logo.replace(/^\/+/, '')}`}
                    alt={team.teamName}
                    className="w-10 h-10 rounded-full object-cover border-2 border-slate-200 flex-shrink-0"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                )}
                
                {/* Team Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate" title={team.teamName}>
                    {team.teamName}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {/* Progress bar */}
                    <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${getColorClass(team.remainingPoints)} transition-all duration-300`}
                        style={{ width: `${pursePercentage}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
                
                {/* Purse Amount */}
                <div className="flex-shrink-0 text-right">
                  <div className={`text-lg font-black ${getColorClass(team.remainingPoints)} bg-clip-text text-transparent leading-none`}
                       style={{
                         backgroundImage: `linear-gradient(135deg, ${
                           team.remainingPoints <= 10 ? '#dc2626, #991b1b' :
                           team.remainingPoints <= 30 ? '#f97316, #ea580c' :
                           team.remainingPoints <= 60 ? '#eab308, #ca8a04' :
                           '#22c55e, #16a34a'
                         })`
                       }}>
                    ₹{team.remainingPoints}
                  </div>
                  <div className="text-[10px] text-slate-500 font-semibold">
                    {team.rosterSlotsFilled || 0}/11
                  </div>
                </div>

                {/* Online Indicator */}
                {team.isOnline && (
                  <div className="absolute -top-1 -right-1">
                    <div className="w-3 h-3 bg-green-500 rounded-full border-2 border-white animate-pulse"></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      
      <style jsx>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
};

export default TeamPurseBar;
