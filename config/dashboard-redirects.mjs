// The private dashboards moved under /dashboard (issue #49). The old top-level
// routes and the pre-split /finance sub-paths (issue #44) redirect permanently.
export const dashboardRedirects = [
  { source: '/finance', destination: '/dashboard', permanent: true },
  { source: '/cash', destination: '/dashboard/cash', permanent: true },
  { source: '/invest', destination: '/dashboard/invest', permanent: true },
  { source: '/business', destination: '/dashboard/business', permanent: true },
  { source: '/finance/cash', destination: '/dashboard/cash', permanent: true },
  { source: '/finance/invest', destination: '/dashboard/invest', permanent: true },
]
