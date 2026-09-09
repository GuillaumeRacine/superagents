import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head, Search } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: {
    default: 'Super Agents',
    template: '%s — Super Agents'
  },
  description: "A navigable, evidence-backed map of Gui's complete agentic operating system.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
}

const navbar = (
  <Navbar
    logo={<span style={{ fontWeight: 800, fontSize: '1.1rem' }}>Super Agents</span>}
    projectLink="https://github.com/GuillaumeRacine/superagents"
  />
)

const footer = (
  <Footer>
    Derived system map · Verify live behavior at the owning source
  </Footer>
)

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <body>
        <Layout
          navbar={navbar}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/GuillaumeRacine/superagents/tree/main"
          footer={footer}
          sidebar={{ defaultMenuCollapseLevel: 1, toggleButton: true }}
          search={<Search placeholder="Search systems, tools, or workflows…" />}
          toc={{ backToTop: true }}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}
