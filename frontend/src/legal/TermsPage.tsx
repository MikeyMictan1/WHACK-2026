import { LegalPage } from './LegalPage.tsx'

const REPO = 'https://github.com/MikeyMictan1/WHACK-2026'

const link = 'underline underline-offset-4 hover:text-brand'

export function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="8 November 2026"
      sections={[
        {
          heading: 'What Teenacredit is',
          body: (
            <>
              <p>
                Teenacredit teaches kids and teens how credit cards work by letting them use one with play money. A parent sets
                up the family, gives each child an allowance and a shop, and the child spends, borrows, pays back and haggles
                over interest rates in a safe place.
              </p>
              <p>
                It was built by team Giddy Up Glitch for the Whack 2026 hackathon. It is a demo and a learning tool, not a
                finished commercial product, and it may change, break or be taken offline at any time.
              </p>
            </>
          ),
        },
        {
          heading: 'Play money only',
          body: (
            <>
              <p>
                All money in Teenacredit is Whack Coins (WC). They are not a real currency, they have no cash value, and they
                cannot be bought, sold, exchanged or withdrawn. Rewards in the shop, such as a cinema trip or a PS5 goal, are
                promises set by the parent inside the family. Teenacredit does not supply, pay for or deliver them.
              </p>
              <p>
                The cards (CaliccoCredit, DeerDebit, ChipOne, Venture &lt;W&gt; and The Shark Father) are made up for the game.
                They are not real financial products and are not connected to any real bank or card company.
              </p>
            </>
          ),
        },
        {
          heading: 'Not financial advice',
          body: (
            <p>
              Interest, statements, late fees and the credit score are simplified so they are easy to learn from. The credit
              score is calculated inside the app only. It is never shared with, or reported to, any credit reference agency,
              and it does not affect anyone's real credit record. Real credit cards work differently in the details. Talk to
              a qualified adviser before making real money decisions.
            </p>
          ),
        },
        {
          heading: 'Family accounts',
          body: (
            <>
              <p>
                Only a parent or guardian can sign up. The parent creates their children's accounts, chooses their usernames
                and passwords, and is responsible for how those accounts are used. By creating a child account you confirm
                that you are that child's parent or guardian and agree to these terms for them.
              </p>
              <p>
                Keep your passwords and your NFC card safe. A tapped card can approve a purchase, switch a plan or log in, the
                same way a password can.
              </p>
            </>
          ),
        },
        {
          heading: 'Purchases and approvals',
          body: (
            <p>
              Real-life rewards and big goals need the parent's approval before the child can pay. In-game items, such as
              dashboard decor and LED skins, can be bought by the child without asking, as long as they have enough balance
              or credit. Every purchase is confirmed by tapping the child's card (or a simulated tap in the demo). Purchases
              cannot be undone, but because the money is play money, nothing real is lost.
            </p>
          ),
        },
        {
          heading: 'The AI features',
          body: (
            <p>
              The card sellers you negotiate with, the Ask helper and the written summaries are produced by an AI model
              (Claude, made by Anthropic). They can make mistakes. Rates, limits and balances always come from the app's own
              rules, never from what the AI writes, so the number on screen is the one that counts. If the AI is not
              available, a scripted version takes over.
            </p>
          ),
        },
        {
          heading: 'Fair use',
          body: (
            <p>
              Do not try to break into other people's accounts, interfere with the service, overload it, or use the chat
              features to produce anything harmful or abusive. Be kind to the sellers. Being rude to them puts your rate up
              anyway. We may suspend or remove accounts that misuse the service.
            </p>
          ),
        },
        {
          heading: 'Hardware',
          body: (
            <p>
              Teenacredit can work with an NFC card reader, an LED display and phone taps. These are optional. If a device is
              missing or not working, the site still works without it.
            </p>
          ),
        },
        {
          heading: 'No warranty, limited liability',
          body: (
            <p>
              Teenacredit is provided as it is, free of charge, without any guarantee that it will be available, accurate or
              free of bugs. Accounts and data may be reset while the project is being developed. As far as the law allows, the
              team is not liable for any loss arising from using it. Since no real money is involved, there should not be any.
            </p>
          ),
        },
        {
          heading: 'Changes and contact',
          body: (
            <p>
              We may update these terms as the project changes. The date at the top shows the latest version. Questions or
              problems can be raised on the project's{' '}
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
