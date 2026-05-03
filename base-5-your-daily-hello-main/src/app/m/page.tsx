import { redirect } from 'next/navigation'

export default async function MobileEntryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams
  const isLegacyDemo = params.demo === 'true' || params.auth === 'true'

  if (isLegacyDemo) {
    const next = new URLSearchParams()
    if (params.auth === 'true') {
      next.set('auth', 'true')
    }
    const suffix = next.size > 0 ? `?${next.toString()}` : ''
    redirect(`/m/legacy-demo${suffix}`)
  }

  redirect('/m/feed')
}
