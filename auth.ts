import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { isAllowedEmail } from '@/lib/access-policy.mjs'

export const { handlers, auth } = NextAuth({
  providers: [
    Google({
      authorization: { params: { prompt: 'select_account' } },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 12 * 60 * 60,
  },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== 'google') return false
      return profile?.email_verified === true && isAllowedEmail(profile.email)
    },
  },
})
