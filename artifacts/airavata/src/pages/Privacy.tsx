/**
 * Privacy Policy page — required by Meta for App Review submission.
 * Public route: /privacy
 */
export default function Privacy() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border p-10 space-y-8">
        {/* Header */}
        <div className="border-b pb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#075E54] flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white">
                <path d="M20.52 3.48A11.93 11.93 0 0 0 12 0C5.37 0 0 5.37 0 12c0 2.11.55 4.16 1.6 5.97L0 24l6.19-1.62A11.94 11.94 0 0 0 12 24c6.63 0 12-5.37 12-12 0-3.21-1.25-6.22-3.48-8.52zM12 22c-1.85 0-3.66-.5-5.23-1.44l-.37-.22-3.87 1.01 1.04-3.77-.24-.39A9.94 9.94 0 0 1 2 12C2 6.48 6.48 2 12 2c2.67 0 5.17 1.04 7.07 2.93A9.94 9.94 0 0 1 22 12c0 5.52-4.48 10-10 10zm5.44-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.48-1.76-1.66-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01s-.52.07-.79.37c-.27.3-1.04 1.01-1.04 2.47s1.06 2.87 1.21 3.07c.15.2 2.09 3.19 5.06 4.48.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.08-.12-.27-.2-.57-.35z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Privacy Policy</h1>
              <p className="text-sm text-gray-500">Airavata Intelligence — WhatsApp Business Solution</p>
            </div>
          </div>
          <p className="text-sm text-gray-500">
            Effective date: <strong>July 1, 2025</strong> &nbsp;·&nbsp; Last updated: <strong>July 17, 2026</strong>
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">1. Who We Are</h2>
          <p className="text-gray-700 leading-relaxed">
            Airavata Intelligence ("Airavata", "we", "our", or "us") operates the Airavata WhatsApp Business
            SaaS platform accessible at <a href="https://airavataintelligence.com" className="text-[#075E54] underline">airavataintelligence.com</a>.
            We provide businesses with tools to manage WhatsApp campaigns, contacts, live chat, and automation
            through the Meta WhatsApp Business API.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">2. Data We Collect</h2>
          <ul className="list-disc pl-5 space-y-2 text-gray-700">
            <li><strong>Account data:</strong> Business name, email address, phone number, and password hash when you create an account.</li>
            <li><strong>WhatsApp Business data:</strong> WhatsApp Business Account (WABA) ID, phone number ID, and access tokens when you connect via Facebook Login for Business.</li>
            <li><strong>Contact data:</strong> Names, phone numbers, and tags you import or collect through your WhatsApp conversations.</li>
            <li><strong>Message data:</strong> Content of WhatsApp messages sent and received through the platform, including campaign messages and live chat conversations.</li>
            <li><strong>Usage data:</strong> Campaign statistics (sent, delivered, read, failed counts) and credit balance transactions.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">3. How We Use Your Data</h2>
          <ul className="list-disc pl-5 space-y-2 text-gray-700">
            <li>To provide and operate the Airavata platform and its features.</li>
            <li>To send WhatsApp messages on your behalf via the Meta WhatsApp Cloud API.</li>
            <li>To display campaign performance analytics and conversation history.</li>
            <li>To authenticate your account and maintain session security.</li>
            <li>To respond to support requests and platform issues.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">4. Meta Platform Data</h2>
          <p className="text-gray-700 leading-relaxed">
            Airavata integrates with Meta's WhatsApp Business API and Facebook Login for Business. When you
            connect your WhatsApp Business Account, we receive and store access tokens and WABA identifiers
            provided by Meta. This data is used solely to operate the WhatsApp messaging features on your behalf.
            We do not sell or share this data with third parties outside of what is required to operate the platform.
          </p>
          <p className="text-gray-700 leading-relaxed">
            Meta Platform Data is handled in accordance with <a href="https://developers.facebook.com/policy/" className="text-[#075E54] underline" target="_blank" rel="noopener noreferrer">Meta's Platform Terms</a> and
            the <a href="https://developers.facebook.com/devpolicy/" className="text-[#075E54] underline" target="_blank" rel="noopener noreferrer">Meta Developer Policies</a>.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">5. Data Storage & Security</h2>
          <p className="text-gray-700 leading-relaxed">
            All data is stored in MongoDB Atlas (cloud database). Passwords are stored as bcrypt hashes and
            are never stored in plain text. Access tokens are stored encrypted and are never exposed to
            end users. We use HTTPS for all data in transit.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">6. Data Retention</h2>
          <p className="text-gray-700 leading-relaxed">
            We retain your data for as long as your account is active. If you delete your account, your
            personal data, contacts, and message history will be permanently deleted within 30 days.
            You may request deletion at any time by contacting us.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">7. Data Deletion</h2>
          <p className="text-gray-700 leading-relaxed">
            To request deletion of your data, email us at{' '}
            <a href="mailto:raneaniket23@gmail.com" className="text-[#075E54] underline">raneaniket23@gmail.com</a>{' '}
            with the subject line "Data Deletion Request". We will confirm deletion within 30 days.
          </p>
          <p className="text-gray-700 leading-relaxed">
            If you connected your WhatsApp Business Account through Facebook Login and subsequently remove
            Airavata from your Facebook app permissions, your WABA access token will be automatically
            invalidated and we will receive a deauthorization callback to remove your data.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">8. Third-Party Services</h2>
          <ul className="list-disc pl-5 space-y-2 text-gray-700">
            <li><strong>Meta / WhatsApp:</strong> For WhatsApp Business API messaging</li>
            <li><strong>MongoDB Atlas:</strong> For database hosting</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">9. Your Rights</h2>
          <p className="text-gray-700 leading-relaxed">
            You have the right to access, correct, export, or delete the personal data we hold about you.
            To exercise these rights, contact us at the email below.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">10. Contact Us</h2>
          <p className="text-gray-700">
            <strong>Airavata Intelligence</strong><br />
            Email: <a href="mailto:raneaniket23@gmail.com" className="text-[#075E54] underline">raneaniket23@gmail.com</a><br />
            Website: <a href="https://airavataintelligence.com" className="text-[#075E54] underline">airavataintelligence.com</a>
          </p>
        </section>

        <div className="border-t pt-6 text-xs text-gray-400 text-center">
          © {new Date().getFullYear()} Airavata Intelligence. All rights reserved.
        </div>
      </div>
    </div>
  );
}
