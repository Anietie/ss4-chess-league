interface Badge { badge_type: string; season?: number; description?: string; earned_at?: string; }

const BADGE_META: Record<string, { icon: string; name: string; colour: string }> = {
  pioneer_s1:     { icon: '🏅', name: 'Pioneer',        colour: 'bg-gold/20 border-gold/40 text-gold' },
  cl_winner:      { icon: '🏆', name: 'CL Champion',    colour: 'bg-star/20 border-star/40 text-star' },
  cl_runner_up:   { icon: '🥈', name: 'CL Runner-Up',   colour: 'bg-silver/20 border-silver/40 text-silver' },
  giant_killer:   { icon: '⚔️',  name: 'Giant Killer',   colour: 'bg-red-900/30 border-red-700/50 text-red-300' },
  comeback_king:  { icon: '👑', name: 'Comeback King',  colour: 'bg-gold/20 border-gold/40 text-gold' },
  unbeaten_run:   { icon: '🔥', name: 'Unbeaten Run',   colour: 'bg-orange-900/30 border-orange-700/50 text-orange-300' },
  top_scorer:     { icon: '🎯', name: 'Top Scorer',     colour: 'bg-green-900/30 border-green-700/50 text-green-300' },
  clean_sheet:    { icon: '🛡️', name: 'Clean Sheet',    colour: 'bg-navy-800/50 border-ink-600 text-ink-300' },
  centurion:      { icon: '💯', name: 'Centurion',      colour: 'bg-ink-700 border-ink-600 text-ink-300' },
  speed_demon:    { icon: '⚡', name: 'Speed Demon',    colour: 'bg-yellow-900/30 border-yellow-700/50 text-yellow-300' },
  endgame_wizard: { icon: '🧙', name: 'Endgame Wizard', colour: 'bg-purple-900/30 border-purple-700/50 text-purple-300' },
  first_blood:    { icon: '🗡️',  name: 'First Blood',   colour: 'bg-crimson/30 border-crimson/50 text-red-300' },
};

export function BadgeWall({ badges }: { badges: Badge[] }) {
  return (
    <div className="flex flex-wrap gap-3">
      {badges.map((b, i) => {
        const meta = BADGE_META[b.badge_type] ?? { icon: '🏅', name: b.badge_type, colour: 'bg-ink-700 border-ink-600 text-ink-300' };
        return (
          <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${meta.colour}`}
            title={b.description ?? meta.name}>
            <span className="text-lg leading-none">{meta.icon}</span>
            <div>
              <div className="text-xs font-semibold leading-none">{meta.name}</div>
              {b.season && <div className="text-xs opacity-60 leading-none mt-0.5">S{b.season}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}