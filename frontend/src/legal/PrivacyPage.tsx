import { LegalPage } from './LegalPage.tsx'

export function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="[date]"
      sections={[
        {
          heading: 'What we collect',
          body: (
            <p>
              As shipped, this template stores the name, email address and an Argon2 hash of the
              password for each account, plus the date the account was created. [Add anything
              else your product collects.]
            </p>
          ),
        },
        {
          heading: 'Cookies',
          body: (
            <p>
              One httpOnly cookie, <code className="font-mono text-sm">access_token</code>, keeps you
              signed in. It holds a signed token with your user ID and expires after 24 hours.
              [List any analytics or third-party cookies you add.]
            </p>
          ),
        },
        {
          heading: 'How we use it',
          body: <p>[Why each piece of data is needed and the legal basis for processing it.]</p>,
        },
        {
          heading: 'Sharing',
          body: <p>[Third parties that receive data, such as hosting or email providers.]</p>,
        },
        {
          heading: 'Your rights',
          body: <p>[How to request a copy of your data, correct it, or delete your account.]</p>,
        },
        {
          heading: 'Contact',
          body: <p>[Email address for privacy questions.]</p>,
        },
      ]}
    />
  )
}
