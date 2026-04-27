import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/dashboard', '/play', '/admin'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isHome = pathname === '/';
  const isProtected = PROTECTED.some(p => pathname.startsWith(p));
  if (!isProtected && !isHome) return NextResponse.next();

  const response = NextResponse.next({ request: { headers: request.headers } });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Redirect logged-in users from home to dashboard
  if (isHome && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (!user) {
    if (isHome) return NextResponse.next();
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin-only protection
  if (pathname.startsWith('/admin')) {
    const { data: player } = await supabase
      .from('players').select('is_admin').eq('auth_user_id', user.id).single();
    if (!player?.is_admin) return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/', '/dashboard/:path*', '/play/:path*', '/admin/:path*'],
};