import { createServerClient } from "@/lib/supabase";
import { leagueName } from "@/lib/utils";
import { Swords, Trophy, Users, ArrowRight } from "lucide-react";
import Link from "next/link";

const supabase = createServerClient();

async function getLeaguesData() {
  // Get current season
  const { data: season } = await supabase
    .from("seasons")
    .select("id, name, status")
    .order("id", { ascending: false })
    .limit(1)
    .single();

  const seasonId = season?.id ?? 1;

  // Get leagues with player counts from standings
  const { data: standings } = await supabase
    .from("standings")
    .select("league, player_id")
    .eq("season", seasonId);

  // Count players per league
  const leagueCounts = new Map<string, number>();
  const seenPlayers = new Map<string, Set<string>>();
  
  for (const s of standings ?? []) {
    if (/^league_\d+$/.test(s.league)) {
      if (!seenPlayers.has(s.league)) {
        seenPlayers.set(s.league, new Set());
      }
      seenPlayers.get(s.league)!.add(s.player_id);
    }
  }

  for (const [league, players] of seenPlayers) {
    leagueCounts.set(league, players.size);
  }

  // Sort leagues numerically
  const leagues = [...leagueCounts.entries()]
    .sort((a, b) => parseInt(a[0].replace("league_", "")) - parseInt(b[0].replace("league_", "")));

  return { season, leagues };
}

export default async function LeaguesPage() {
  const { season, leagues } = await getLeaguesData();

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold text-chalk">Leagues</h1>
        {season && (
          <p className="text-ink-400 mt-1">
            {season.name} · <span className="capitalize">{season.status.replace(/_/g, " ")}</span>
          </p>
        )}
      </div>

      {/* League Cards */}
      {leagues.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {leagues.map(([league, count], i) => {
            const isL1 = league === 'league_1';
            const isL2 = league === 'league_2';
            return (
              <Link
                key={league}
                href={`/league/${league}`}
                className={`card-hover p-6 group relative overflow-hidden ${
                  isL1 ? 'border-blue-500/30 hover:border-blue-500/60' :
                  isL2 ? 'border-orange-500/30 hover:border-orange-500/60' :
                  'border-ink-700 hover:border-ink-500'
                }`}
              >
                {/* Background accent */}
                <div className={`absolute top-0 right-0 w-24 h-24 rounded-bl-full opacity-10 -mr-8 -mt-8 ${
                  isL1 ? 'bg-blue-500' :
                  isL2 ? 'bg-orange-500' :
                  i % 2 === 0 ? 'bg-blue-500' : 'bg-orange-500'
                }`} />
                
                <div className="relative">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      isL1 ? 'bg-blue-500/20 text-blue-400' :
                      isL2 ? 'bg-orange-500/20 text-orange-400' :
                      i % 2 === 0 ? 'bg-blue-500/20 text-blue-400' : 'bg-orange-500/20 text-orange-400'
                    }`}>
                      <Trophy size={18} />
                    </div>
                    <div>
                      <h3 className="font-display text-lg font-bold text-chalk">
                        {leagueName(league)}
                      </h3>
                      <p className="text-xs text-ink-400 flex items-center gap-1">
                        <Users size={11} />
                        {count} players
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-ink-700">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      isL1 ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30' :
                      isL2 ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30' :
                      'bg-ink-700 text-ink-300 border border-ink-600'
                    }`}>
                      {isL1 ? 'Premier' : isL2 ? 'Championship' : `Division ${parseInt(league.replace('league_', ''))}`}
                    </span>
                    <span className="text-xs text-ink-400 group-hover:text-orange-400 transition-colors flex items-center gap-1">
                      View League <ArrowRight size={12} />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}

          {/* SCEL Card */}
          <Link
            href="/league/scel"
            className="card-hover p-6 group relative overflow-hidden border-yellow-500/30 hover:border-yellow-500/60"
          >
            <div className="absolute top-0 right-0 w-24 h-24 rounded-bl-full opacity-10 -mr-8 -mt-8 bg-yellow-500" />
            
            <div className="relative">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-yellow-500/20 text-yellow-400">
                  <Swords size={18} />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-chalk">SCEL</h3>
                  <p className="text-xs text-ink-400">Elimination League</p>
                </div>
              </div>
              
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-ink-700">
                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
                  Knockout
                </span>
                <span className="text-xs text-ink-400 group-hover:text-yellow-400 transition-colors flex items-center gap-1">
                  View Bracket <ArrowRight size={12} />
                </span>
              </div>
            </div>
          </Link>
        </div>
      ) : (
        /* No leagues yet */
        <div className="card p-12 text-center border-dashed border-ink-600">
          <div className="text-4xl mb-4">🏗️</div>
          <div className="font-display text-xl font-bold text-chalk mb-2">
            No Leagues Yet
          </div>
          <p className="text-ink-400 text-sm max-w-md mx-auto">
            Leagues are created after the draft. Players are assigned to leagues, and fixtures are generated automatically. Check back after registration closes!
          </p>
          {season && (
            <div className="mt-4 text-xs text-ink-500">
              Season status: <span className="capitalize text-orange-400">{season.status.replace(/_/g, " ")}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}