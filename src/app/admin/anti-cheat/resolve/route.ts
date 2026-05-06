import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const adminSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

export async function POST(req: NextRequest) {
  if (req.headers.get('x-admin-secret') !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { violation_id, resolution, severity } = await req.json();
  const supabase = adminSupabase();

  // Fetch the violation
  const { data: violation } = await supabase
    .from('conduct_violations')
    .select('*')
    .eq('id', violation_id)
    .single();

  if (!violation) {
    return NextResponse.json({ error: 'Violation not found' }, { status: 404 });
  }

  const updates: any = {
    resolved_at: new Date().toISOString(),
    reviewed_by: 'admin',
  };

  if (resolution === 'confirmed') {
    updates.violation_type = 'cheating_confirmed';
    if (severity) updates.severity = severity;

    // Handle player sanctions
    if (severity === 'game_forfeit' && violation.game_id) {
      // Overturn the game result to forfeit for the cheater
      const { data: game } = await supabase
        .from('games')
        .select('white_player_id, black_player_id')
        .eq('id', violation.game_id)
        .single();

      if (game) {
        const forfeitResult = game.white_player_id === violation.player_id ? '0-1' : '1-0';
        await supabase.from('games').update({
          result: forfeitResult,
          anticheat_flagged: false,
        }).eq('id', violation.game_id);
      }
    }

    if (severity === 'suspension') {
      await supabase.from('players').update({
        is_suspended: true,
        suspension_reason: `Cheating confirmed — ${violation.description}`,
      }).eq('id', violation.player_id);
    }

    if (severity === 'ban') {
      await supabase.from('players').update({
        is_suspended: true,
        is_active: false,
        suspension_reason: `Banned — cheating confirmed`,
      }).eq('id', violation.player_id);
    }

    // Notify the player
    await supabase.from('notifications').insert({
      player_id: violation.player_id,
      type: 'admin_action',
      title: severity === 'ban' ? 'Account Banned' : severity === 'suspension' ? 'Account Suspended' : 'Game Forfeited',
      message: severity === 'dismissed'
        ? 'The flagged game review has been dismissed. No action taken.'
        : `A League Officer has reviewed your game and confirmed a conduct violation. Sanction: ${severity?.replace(/_/g, ' ')}.`,
    });

  } else {
    // Dismissed
    updates.violation_type = 'cheating_flag';
    updates.severity = 'warning';

    // Clear the anticheat flag on the game
    if (violation.game_id) {
      await supabase.from('games').update({ anticheat_flagged: false }).eq('id', violation.game_id);
    }

    await supabase.from('notifications').insert({
      player_id: violation.player_id,
      type: 'admin_action',
      title: 'Game Review Dismissed',
      message: 'A League Officer has reviewed your flagged game and determined no violation occurred. The flag has been cleared.',
    });
  }

  await supabase.from('conduct_violations').update(updates).eq('id', violation_id);

  return NextResponse.json({
    success: true,
    resolution,
    severity: severity ?? violation.severity,
    action_taken: resolution === 'confirmed'
      ? `Player sanctioned: ${severity ?? violation.severity}`
      : 'Flag dismissed, no action taken',
  });
}