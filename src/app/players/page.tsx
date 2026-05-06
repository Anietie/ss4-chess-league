"use client";
import { formatRating, leagueName, leaguePillClass } from "@/lib/utils";
import {
  BookOpen,
  Filter,
  GraduationCap,
  Search,
  Star
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

interface Player {
  id: string;
  full_name: string;
  home_league: string;
  school?: string;
  department?: string;
  institution_category?: string;
  ss4_rating: number;
  rating_deviation: number;
  is_provisional: boolean;
  joining_season: number;
  games_played: number;
  chess_com_username?: string;
  calibration_complete: boolean;
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [filtered, setFiltered] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [leagueFilter, setLeagueFilter] = useState("all");
  const [schoolFilter, setSchoolFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"rating" | "name" | "games" | "school">(
    "rating",
  );

  useEffect(() => {
    fetch("/api/players?limit=200")
      .then((r) => r.json())
      .then((d) => {
        setPlayers(d.players ?? []);
        setFiltered(d.players ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    let list = [...players];

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.full_name.toLowerCase().includes(q) ||
          p.chess_com_username?.toLowerCase().includes(q) ||
          p.school?.toLowerCase().includes(q) ||
          p.department?.toLowerCase().includes(q),
      );
    }

    if (leagueFilter !== "all")
      list = list.filter((p) => p.home_league === leagueFilter);
    if (schoolFilter)
      list = list.filter((p) =>
        p.school?.toLowerCase().includes(schoolFilter.toLowerCase()),
      );
    if (categoryFilter !== "all")
      list = list.filter((p) => p.institution_category === categoryFilter);

    list.sort((a, b) => {
      switch (sortBy) {
        case "rating":
          return b.ss4_rating - a.ss4_rating;
        case "name":
          return a.full_name.localeCompare(b.full_name);
        case "games":
          return b.games_played - a.games_played;
        case "school":
          return (
            (a.school || "").localeCompare(b.school || "") ||
            b.ss4_rating - a.ss4_rating
          );
        default:
          return b.ss4_rating - a.ss4_rating;
      }
    });

    setFiltered(list);
  }, [players, search, leagueFilter, schoolFilter, categoryFilter, sortBy]);

  const avgRating = players.length
    ? Math.round(players.reduce((s, p) => s + p.ss4_rating, 0) / players.length)
    : 0;
  const topRated = players.reduce(
    (max, p) => (p.ss4_rating > (max?.ss4_rating ?? 0) ? p : max),
    players[0],
  );
  const leagues = [...new Set(players.map((p) => p.home_league))]
    .filter((l) => /^league_\d+$/.test(l))
    .sort((a, b) => Number(a.split("_")[1]) - Number(b.split("_")[1]));

  const schools = [
    ...new Set(
      players.map((p) => p.school).filter((s): s is string => Boolean(s)),
    ),
  ]
    .sort()
    .slice(0, 15);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 page-enter">
      <div className="mb-8">
        <h1 className="font-display text-4xl font-black text-chalk mb-2">
          Players
        </h1>
        <p className="text-ink-400">{players.length} registered</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="card p-4 text-center">
          <div className="font-display text-3xl font-black text-gold mb-1">
            {players.length}
          </div>
          <div className="text-xs text-ink-400 uppercase tracking-wider">
            Total Players
          </div>
        </div>
        <div className="card p-4 text-center">
          <div className="font-display text-3xl font-black text-chalk mb-1">
            {avgRating}
          </div>
          <div className="text-xs text-ink-400 uppercase tracking-wider">
            Average Rating
          </div>
        </div>
        <div className="card p-4 text-center">
          <div className="font-display text-2xl font-black text-silver mb-1 truncate">
            {topRated?.full_name?.split(" ")[0] ?? "—"}
          </div>
          <div className="text-xs text-ink-400 uppercase tracking-wider">
            Top Rated
          </div>
        </div>
        <div className="card p-4 text-center">
          <div className="font-display text-2xl font-black text-gold mb-1">
            {schools.length}
          </div>
          <div className="text-xs text-ink-400 uppercase tracking-wider">
            Schools
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, school, or department…"
            className="input pl-9"
          />
        </div>
        <select
          value={leagueFilter}
          onChange={(e) => setLeagueFilter(e.target.value)}
          className="input w-36"
        >
          <option value="all">All Leagues</option>
          {leagues.map((l) => (
            <option key={l} value={l}>
              {leagueName(l)}
            </option>
          ))}
          <option value="unassigned">Unassigned</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="input w-40"
        >
          <option value="all">All Categories</option>
          <option value="university">University</option>
          <option value="polytechnic">Polytechnic</option>
          <option value="college_of_education">College of Education</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="input w-36"
        >
          <option value="rating">By Rating</option>
          <option value="name">By Name</option>
          <option value="games">By Games</option>
          <option value="school">By School</option>
        </select>
      </div>

      {/* School quick filters */}
      {schools.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Filter size={13} className="text-ink-500 flex-shrink-0" />
          {schools.map((school) => (
            <button
              key={school}
              onClick={() =>
                setSchoolFilter(schoolFilter === school ? "" : school)
              }
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors whitespace-nowrap ${
                schoolFilter === school
                  ? "bg-gold/20 border-gold text-gold"
                  : "border-ink-700 text-ink-400 hover:text-chalk hover:border-ink-600"
              }`}
            >
              <GraduationCap size={10} className="inline mr-1" />
              {school}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="card p-12 text-center text-ink-400 animate-pulse">
          Loading players…
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-ink-500">
          {search || schoolFilter || categoryFilter !== "all"
            ? "No players match your filters."
            : "No players found."}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-700">
                <th className="text-left text-xs uppercase tracking-wider text-ink-400 py-3 px-4 w-10">
                  #
                </th>
                <th className="text-left text-xs uppercase tracking-wider text-ink-400 py-3 px-4">
                  Player
                </th>
                <th className="text-left text-xs uppercase tracking-wider text-ink-400 py-3 px-4 hidden md:table-cell">
                  School
                </th>
                <th className="text-left text-xs uppercase tracking-wider text-ink-400 py-3 px-4 hidden md:table-cell">
                  Category
                </th>
                <th className="text-left text-xs uppercase tracking-wider text-ink-400 py-3 px-4">
                  League
                </th>
                <th className="text-left text-xs uppercase tracking-wider text-ink-400 py-3 px-4">
                  Rating
                </th>
                <th className="text-left text-xs uppercase tracking-wider text-ink-400 py-3 px-4 text-center">
                  Games
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr
                  key={p.id}
                  className="border-b border-ink-800 hover:bg-ink-700/20 transition-colors"
                >
                  <td className="py-3 px-4 text-ink-500 font-mono text-xs">
                    {i + 1}
                  </td>
                  <td className="py-3 px-4">
                    <Link
                      href={`/profile/${p.id}`}
                      className="flex items-center gap-2 group"
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 bg-ink-700 text-chalk">
                        {p.full_name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-medium text-chalk group-hover:text-gold transition-colors">
                          {p.full_name}
                        </div>
                        {p.department && (
                          <div className="text-xs text-ink-500 flex items-center gap-1">
                            <BookOpen size={9} />
                            {p.department}
                          </div>
                        )}
                      </div>
                      {p.joining_season === 1 && (
                        <span title="Season 1 Pioneer">
                          <Star size={10} className="text-gold/60" />
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="py-3 px-4 hidden md:table-cell">
                    {p.school ? (
                      <div className="flex items-center gap-1.5 text-xs text-ink-300">
                        <GraduationCap size={11} className="text-ink-500" />
                        <span className="truncate max-w-[150px] block">
                          {p.school}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-ink-600">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 hidden md:table-cell">
                    {p.institution_category ? (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded-full ${
                          p.institution_category === "university"
                            ? "bg-blue-900/30 text-blue-300"
                            : p.institution_category === "polytechnic"
                              ? "bg-green-900/30 text-green-300"
                              : "bg-purple-900/30 text-purple-300"
                        }`}
                      >
                        {p.institution_category === "university"
                          ? "Uni"
                          : p.institution_category === "polytechnic"
                            ? "Poly"
                            : "COE"}
                      </span>
                    ) : (
                      <span className="text-xs text-ink-600">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className={leaguePillClass(p.home_league)}>
                      {leagueName(p.home_league)}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`font-mono font-bold ${p.is_provisional ? "text-ink-300" : "text-chalk"}`}
                    >
                      {formatRating(p.ss4_rating, p.rating_deviation)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-ink-400 text-center">
                    {p.games_played}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-ink-800 text-xs text-ink-500 flex justify-between">
            <span>
              {filtered.length} of {players.length} players shown
            </span>
            {(search || schoolFilter || categoryFilter !== "all") && (
              <button
                onClick={() => {
                  setSearch("");
                  setSchoolFilter("");
                  setCategoryFilter("all");
                }}
                className="text-gold hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
