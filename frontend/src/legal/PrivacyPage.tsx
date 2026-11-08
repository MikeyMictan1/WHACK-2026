import { LegalPage } from './LegalPage.tsx'

const REPO = 'https://github.com/MikeyMictan1/WHACK-2026'

const link = 'underline underline-offset-4 hover:text-brand'
const code = 'font-mono text-sm'

export function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="8 November 2026"
      sections={[
        {
          heading: 'The short version',
          body: (
            <p>
              Teenacredit keeps only what it needs to run a play-money credit card for your family. We do not ask for real
              bank details, email addresses or dates of birth, we do not show adverts, and we do not sell or share data for
              marketing. Children's accounts are created and managed by their parent.
            </p>
          ),
        },
        {
          heading: 'What we store',
          body: (
            <>
              <p>
                <strong className="font-medium text-ink">Accounts:</strong> username, an optional display name, and a password
                stored only as an Argon2 hash (we never see or keep the password itself). For children, also the parent they
                belong to and the settings the parent chose: weekly allowance, age setting, which cards they may use, whether
                the credit score is shown, their weekly items and their goals.
              </p>
              <p>
                <strong className="font-medium text-ink">Activity in the app:</strong> play-money balances and transactions,
                purchases and approvals, chores claimed, the card the child is on, what they owe, statements, payments,
                interest and fees, the simulated credit score and the reasons it changed, dashboard decor and the chosen LED
                skin.
              </p>
              <p>
                <strong className="font-medium text-ink">What you type:</strong> messages in plan negotiations, questions
                asked through the Ask helper (with the page they were asked on), and the summaries written for a parent or
                child each month.
              </p>
              <p>
                <strong className="font-medium text-ink">NFC cards:</strong> the serial number (UID) of a child's card, so the
                app knows the card is theirs. A phone tap reads only that serial number.
              </p>
              <p>
                <strong className="font-medium text-ink">Phone notifications:</strong> if you turn them on, the browser's
                push address for that device.
              </p>
            </>
          ),
        },
        {
          heading: 'Who can see it',
          body: (
            <>
              <p>
                A parent can see their own children's balances, purchases, card, statements, credit score (even when it is
                hidden from the child), recent activity and the questions their children asked the Ask helper. Children see
                only their own account. Families cannot see each other.
              </p>
              <p>A site administrator account exists to run the demo, for example to move the site's clock forward.</p>
            </>
          ),
        },
        {
          heading: 'Services we use',
          body: (
            <>
              <p>
                <strong className="font-medium text-ink">Anthropic (Claude)</strong> writes the sellers' replies, the Ask
                helper's answers and the monthly summaries. It receives the message being answered and the numbers it needs,
                such as an APR or a balance. Summaries are built from figures only: we do not send the child's name.
              </p>
              <p>
                <strong className="font-medium text-ink">Railway</strong> hosts the website and its database.
              </p>
              <p>
                <strong className="font-medium text-ink">Your browser's push service</strong> (from Google, Apple or Mozilla)
                delivers notifications if you turn them on. Each one carries a short message, such as "Approved!".
              </p>
              <p>
                <strong className="font-medium text-ink">Open-Meteo</strong> supplies the weather for the LED display. Our
                server asks for one fixed location. No user data is sent.
              </p>
            </>
          ),
        },
        {
          heading: 'Cookies and local storage',
          body: (
            <>
              <p>
                One cookie, <code className={code}>access_token</code>, keeps you logged in. It is httpOnly (scripts on the
                page cannot read it), holds a signed token with your user ID, and expires after 24 hours. There are no
                analytics, advertising or third-party cookies.
              </p>
              <p>
                Your browser also remembers which info pages you have read, in local storage on your own device only.
              </p>
            </>
          ),
        },
        {
          heading: 'Logging out with NFC',
          body: (
            <p>
              A child can choose "Log out with NFC". Their saved data is then encrypted (AES-GCM) and written onto their own
              card, and removed from our system. Tapping the card again brings it back. If the card is lost, so is that
              copy of the data.
            </p>
          ),
        },
        {
          heading: 'Keeping and deleting data',
          body: (
            <p>
              Data is kept while the account exists. A parent can remove a child's account at any time from that child's
              dashboard, which deletes the account and its data. To delete a parent account and everything in the family, or
              to ask for a copy of your data, contact us using the link below. As a hackathon project, the whole database may
              also be reset between demos.
            </p>
          ),
        },
        {
          heading: 'Children',
          body: (
            <p>
              Teenacredit is designed for children aged roughly 10 to 18, used under a parent's supervision. A child cannot
              sign up on their own: their parent creates the account and can change or remove it. We collect no contact
              details from children.
            </p>
          ),
        },
        {
          heading: 'Security',
          body: (
            <p>
              Passwords are hashed with Argon2, logins use a signed cookie, and data saved to NFC cards is encrypted. No
              system is perfectly secure, and this is a student project, so please do not use a password you use anywhere
              else.
            </p>
          ),
        },
        {
          heading: 'Changes and contact',
          body: (
            <p>
              If this policy changes, the date at the top will change too. Questions about privacy can be raised on the
              project's{' '}
              <a href={REPO} className={link} target="_blank" rel="noreferrer">
                GitHub page
              </a>
              .
            </p>
          ),
        },
      ]}
    />
  )
}
