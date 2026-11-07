import { LegalPage } from './LegalPage.tsx'

export function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="[date]"
      sections={[
        {
          heading: 'Who we are',
          body: <p>[Company name, registered address and contact email.]</p>,
        },
        {
          heading: 'Using the service',
          body: <p>[What people may and may not do with the product, and who is allowed to sign up.]</p>,
        },
        {
          heading: 'Accounts',
          body: <p>[How accounts are created and closed, and the user's duty to keep their password safe.]</p>,
        },
        {
          heading: 'Payment',
          body: <p>[Pricing, billing cycle and refunds, or a note that the service is free.]</p>,
        },
        {
          heading: 'Liability',
          body: <p>[Limits of liability and warranty disclaimers.]</p>,
        },
        {
          heading: 'Changes',
          body: <p>[How users are told when these terms change.]</p>,
        },
      ]}
    />
  )
}
