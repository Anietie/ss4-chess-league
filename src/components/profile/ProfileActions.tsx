"use client";
import { Heart, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { ChallengeModal } from "@/components/chess/ChallengeModal";

interface ProfileActionsProps {
  playerId: string;
  playerName: string;
  isOwnProfile: boolean;
}

export function ProfileActions({
  playerId,
  playerName,
  isOwnProfile,
}: ProfileActionsProps) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoadingFollow, setIsLoadingFollow] = useState(false);
  const [showChallenge, setShowChallenge] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);

  useEffect(() => {
    // Load follower status
    fetch(`/api/players/${playerId}/followers?type=followers`)
      .then((r) => r.json())
      .then((d) => setFollowerCount(d.followers?.length ?? 0))
      .catch(console.error);
  }, [playerId]);

  const handleFollow = async () => {
    setIsLoadingFollow(true);
    try {
      const method = isFollowing ? "DELETE" : "POST";
      const res = await fetch(`/api/players/${playerId}/follow`, { method });

      if (res.ok) {
        setIsFollowing(!isFollowing);
      }
    } catch (err) {
      console.error("Error toggling follow:", err);
    } finally {
      setIsLoadingFollow(false);
    }
  };

  if (isOwnProfile) {
    return null;
  }

  return (
    <>
      <div className="flex gap-2 mt-4 pt-4 border-t border-ink-700">
        <button
          onClick={() => setShowChallenge(true)}
          className="flex-1 flex items-center justify-center gap-2 btn-gold text-sm"
        >
          <Zap size={16} />
          Challenge
        </button>
        <button
          onClick={handleFollow}
          disabled={isLoadingFollow}
          className={`flex-1 flex items-center justify-center gap-2 text-sm rounded-lg px-3 py-2 transition-colors ${
            isFollowing
              ? "bg-red-900/30 text-red-400 hover:bg-red-900/50"
              : "bg-ink-700 text-ink-300 hover:bg-ink-600"
          }`}
        >
          <Heart size={16} />
          {isFollowing ? "Following" : "Follow"}
        </button>
      </div>

      {showChallenge && (
        <ChallengeModal
          opponentId={playerId}
          opponentName={playerName}
          onClose={() => setShowChallenge(false)}
        />
      )}
    </>
  );
}
