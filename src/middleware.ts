import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/auth-token';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Exclude public static files and Next internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('.') // images, icons, etc.
  ) {
    return NextResponse.next();
  }

  // 2. Exclude public auth pages & endpoints
  if (
    pathname === '/' ||
    pathname === '/access-denied' ||
    pathname === '/admin/login' ||
    pathname === '/warehouse/login' ||
    pathname === '/inmate/login' ||
    pathname === '/family/login' ||
    pathname === '/family/register' ||
    pathname === '/family/forgot-password' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/payments')
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  const isApi = pathname.startsWith('/api/');

  // Helper to handle unauthenticated requests
  const handleUnauthenticated = (loginPath: string) => {
    if (isApi) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL(loginPath, req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  };

  // Helper to handle forbidden/unauthorized role requests
  const handleForbidden = (requiredRole: string) => {
    if (isApi) {
      return NextResponse.json(
        { error: `Forbidden: ${requiredRole} privileges required.` },
        { status: 403 }
      );
    }
    const deniedUrl = new URL('/access-denied', req.url);
    deniedUrl.searchParams.set('from', pathname);
    deniedUrl.searchParams.set('required', requiredRole);
    return NextResponse.redirect(deniedUrl);
  };

  // 3. Admin Portal and API boundaries (/admin/*, /api/admin/*)
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    if (!session) {
      return handleUnauthenticated('/admin/login');
    }
    if (session.role !== 'ADMIN') {
      return handleForbidden('ADMIN');
    }
    return NextResponse.next();
  }

  // 4. Warehouse Portal and API boundaries (/warehouse/*, /api/warehouse/*)
  if (pathname.startsWith('/warehouse') || pathname.startsWith('/api/warehouse')) {
    if (!session) {
      return handleUnauthenticated('/warehouse/login');
    }
    if (!['WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR'].includes(session.role)) {
      return handleForbidden('WAREHOUSE');
    }
    return NextResponse.next();
  }

  // 5. Inmate Portal and API boundaries (/inmate/*, /api/inmate/*)
  if (pathname.startsWith('/inmate') || pathname.startsWith('/api/inmate')) {
    if (!session) {
      return handleUnauthenticated('/inmate/login');
    }
    if (session.role !== 'INMATE') {
      return handleForbidden('INMATE');
    }
    return NextResponse.next();
  }

  // 6. Family Portal and API boundaries (/family/*, /api/family/*)
  if (pathname.startsWith('/family') || pathname.startsWith('/api/family')) {
    if (!session) {
      return handleUnauthenticated('/family/login');
    }
    if (session.role !== 'FAMILY') {
      return handleForbidden('FAMILY');
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/warehouse/:path*',
    '/inmate/:path*',
    '/family/:path*',
    '/api/admin/:path*',
    '/api/warehouse/:path*',
    '/api/inmate/:path*',
    '/api/family/:path*',
  ],
};

