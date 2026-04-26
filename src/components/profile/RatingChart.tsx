"use client";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

interface Point {
  rating: number;
  rating_deviation: number;
  recorded_at: string;
  change?: number;
}

export function RatingChart({ data }: { data: Point[] }) {
  const chartData = data.map((p) => ({
    date: p.recorded_at.slice(0, 10),
    rating: Math.round(p.rating),
    upper: Math.round(p.rating + p.rating_deviation),
    lower: Math.round(p.rating - p.rating_deviation),
    change: p.change ? Math.round(p.change) : 0,
  }));

  const minRating = Math.min(...chartData.map((d) => d.lower)) - 20;
  const maxRating = Math.max(...chartData.map((d) => d.upper)) + 20;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart
        data={chartData}
        margin={{ top: 5, right: 5, bottom: 0, left: 0 }}
      >
        <defs>
          <linearGradient id="ratingGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#d4a843" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#d4a843" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="rdGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#5a7090" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#5a7090" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tick={{ fill: "#5a7090", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[minRating, maxRating]}
          tick={{ fill: "#5a7090", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <Tooltip
          contentStyle={{
            background: "#161b26",
            border: "1px solid #2a3347",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: "#7a96b8" }}
          itemStyle={{ color: "#d4a843" }}
          formatter={(val: any, name: string) => [
            val,
            name === "rating" ? "Rating" : name === "upper" ? "+RD" : "-RD",
          ]}
        />
        <Area
          type="monotone"
          dataKey="upper"
          stroke="none"
          fill="url(#rdGrad)"
        />
        <Area
          type="monotone"
          dataKey="lower"
          stroke="none"
          fill="url(#rdGrad)"
        />
        <Area
          type="monotone"
          dataKey="rating"
          stroke="#d4a843"
          strokeWidth={2}
          fill="url(#ratingGrad)"
          dot={false}
          activeDot={{ r: 4, fill: "#d4a843" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
