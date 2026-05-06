# SS4 Chess League — Manual Testing Checklist

## Before Each Season
- [ ] Run smoke test: `npx tsx scripts/smoke-test.ts`
- [ ] Run full season simulation: `npx tsx scripts/test-full-season.ts --commit`
- [ ] Verify all test data cleaned up
- [ ] Check Supabase RLS policies still working
- [ ] Deploy to staging and run through registration flow manually

## Registration Flow
- [ ] Register with Chess.com username (should skip calibration)
- [ ] Register with Lichess username (should skip calibration)  
- [ ] Register without platform account (should prompt calibration)
- [ ] Register with duplicate email (should show error)
- [ ] Register with invalid WhatsApp number (should show error)
- [ ] Verify email confirmation link works
- [ ] Sign in after verification
- [ ] Check Pioneer badge awarded for Season 1

## Calibration (Bot Games)
- [ ] Complete 5 calibration games
- [ ] Verify bot difficulty adjusts (win → harder, lose → easier)
- [ ] Check final seed rating is calculated correctly
- [ ] Verify calibration_complete flag set to true
- [ ] Try to calibrate again (should be blocked)

## Draft
- [ ] Preview draft shows balanced distribution
- [ ] Commit draft assigns all players
- [ ] Check league sizes are 6-8 players
- [ ] Verify fixtures generated per league
- [ ] Check notifications sent to all players

## Game Play
- [ ] Join game as both players (two browsers)
- [ ] Make moves, verify clock ticks
- [ ] Test resign (both sides)
- [ ] Test draw offer/accept
- [ ] Test draw offer/decline
- [ ] Verify rating updates after game end
- [ ] Check PGN download contains all moves
- [ ] Test review page loads analysis
- [ ] Test casual challenge flow
- [ ] Test spectator mode

## Disconnect/Reconnect
- [ ] Close browser tab during game (disconnect)
- [ ] Verify opponent sees disconnect banner
- [ ] Verify countdown shows on opponent's screen
- [ ] Reopen browser and rejoin (within 3 minutes)
- [ ] Verify reconnection works, game continues
- [ ] Let 3 minutes expire (should auto-forfeit)
- [ ] Test no-show claim during active game
- [ ] Test nudge opponent button

## Anti-Cheat
- [ ] Complete a game with analysis submission
- [ ] Check admin panel for flagged games
- [ ] Verify conduct_violations table populated
- [ ] Resolve a violation (dismiss/confirm)
- [ ] Check player notifications for flags

## Season Management
- [ ] Advance season through all statuses
- [ ] End league phase, check CL qualification
- [ ] Run CL group draw
- [ ] Generate CL knockout fixtures
- [ ] Finalize season
- [ ] Check badges awarded (League Champion, CL Winner, etc.)
- [ ] Verify coefficients calculated
- [ ] Process promotion/relegation

## Admin Panel
- [ ] Access admin dashboard
- [ ] View player list
- [ ] Reactivate/deactivate players
- [ ] Generate fixtures for a league
- [ ] Set round windows
- [ ] Review flagged games

## Push Notifications
- [ ] Subscribe to push notifications
- [ ] Trigger a notification (nudge, game result)
- [ ] Verify notification appears on device
- [ ] Click notification → navigates to correct page
- [ ] Unsubscribe

## Edge Cases
- [ ] Two players with same rating
- [ ] League with exactly 6 players
- [ ] League with exactly 8 players
- [ ] Draw game in knockout stage (no armageddon yet?)
- [ ] Player forfeits 3 games (should suspend)
- [ ] Return to game page after game ends (should show result)
- [ ] Rapid disconnect/reconnect multiple times