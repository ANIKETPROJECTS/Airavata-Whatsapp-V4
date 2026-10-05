---
name: Interactive commerce login showcase
description: Required behavior for the customer-facing WhatsApp commerce demo on the public login page.
---

Login-page journey copy should describe the product's automated WhatsApp sales flow: a business sends a campaign, an interested shopper messages for product details, AI answers without a human handoff, Flow Builder collects delivery details, the chatbot creates the purchase order, the payment gateway completes checkout, and the system generates and sends the invoice in WhatsApp.

**Why:** The user identified this end-to-end automation as the product's customer journey and asked the login page to explain it clearly, without implying a human takes over.

**How to apply:** Keep the automated product promise distinct from the phone's sample transaction. The showcase is local and simulated; it must not send details, create real orders, or initiate payments.

The showcase is viewed on the customer's phone. Rangrez Studio's product template arrives first, then the customer asks for details; the chatbot replies with specs and Buy Now, a WhatsApp Flow collects customer delivery details using fabricated preview data, and a receipt plus simulated payment link appear. A separate Razorpay screen handles the simulated payment, then completes locally, generates a PDF invoice attachment, and shows Paid · Processing. Business messages are incoming left-side white bubbles; customer messages are outgoing right-side green bubbles. Keep the journey local and do not send details, create real orders, or initiate payments.

The delivery-details step is for customer information, not checkout. Keep its copy black, show the product image, name, price, short description, and readable specifications before the customer fields, omit the preview note/dot, and label the CTA “Save Details”. Do not add a second home-indicator line inside the form.

**Why:** The user wants the delivery form to show both a clear product summary and key specifications, while removing the duplicate line below its button.

**How to apply:** Do not label the delivery-details form “secure checkout” or add payment UI to it. Keep its details local and preview-only without displaying the removed note. Keep payment methods and copy on the distinct Razorpay step. The device's outer iOS home indicator remains part of the phone frame.

Keep the order-summary and payment-link bubbles in the chat history after checkout advances and payment completes. Style them as incoming WhatsApp messages with black text at the normal chat font size; render the payment action as a simple separated button row, and disable it after payment.

**Why:** The user expects the conversation to retain its earlier order and payment messages, read them one at a time, and wants them to match the black, regular-size WhatsApp styling used above.

**How to apply:** Reveal the order summary first, then the payment link after a reading pause. Scroll each new message into view and leave the payment link visible before auto-opening Razorpay. Keep both bubbles in chat history for confirmed, Razorpay, payment-success, and paid states. Preserve the original historical payment-pending copy, but don't allow the payment action to restart checkout once processing has started.

Use a consistent entrance duration and easing for every chat bubble and full-screen stage. The product template should enter only after the phone header and date are visible, rather than appearing in the first frame.

**Why:** The user reported uneven message-card motion and asked for the first product message to transition in instead of already being present.

**How to apply:** Keep a short initial reveal cue for the first bubble, and use shared motion timing for subsequent bubbles and overlays. Keep reading pauses between stages separate from animation speed.

Keep payment confirmation on one Razorpay screen: show the supplied green success animation together with the amount, merchant, payment ID, selected method, and preview-only notice. Do not transition to a separate black-and-white checkmark receipt screen; continue directly to the existing WhatsApp and invoice flow.

**Why:** The user explicitly asked for the former third page's receipt details to appear alongside the animation on the second page, without a separate confirmation page, then clarified that the payment confirmation and invoice need distinct reading time.

**How to apply:** Keep the animated success screen mounted through its completion and display all confirmation details there. Keep that screen's post-animation hold brief, then show the payment-confirmation chat bubble before revealing the invoice after a separate reading pause. Delay replay and automatic invoice opening so they do not crowd or interrupt those messages. Preserve the simulated-only boundary.

The post-payment confirmation uses the user's supplied celebratory “Payment Confirmed” copy, with selected phrases bolded. Retain the payment reference and method. Use separate Instagram and Google review action rows styled like the Buy Now button, with the timestamp immediately above them. Use dummy destinations only when the user explicitly authorizes them; never silently treat sample links as official merchant links.

**Why:** The user supplied the exact message and requested emphasis while keeping payment context; sample social links must not be mistaken for production destinations.

**How to apply:** Preserve the supplied copy's paragraph breaks and bold treatment in the existing payment-confirmation bubble. The heading is “Payment Confirmed, {name}! ✨” without a leading sparkle. Do not add a dash before the team signature or after “Rangrez Studio” in the thank-you line. Put 💫 after “Team Rangrez Studio 🤍”, not after “unwrap the magic!”. Place the timestamp between payment details and action rows. Dummy destinations are for the showcase only, not production messaging.

For the WhatsApp invoice attachment, omit the extra bubble heading and the invoice's “GST INVOICE / SAMPLE PREVIEW” badge. Show a full-width white preview of roughly the top half of the invoice page, and use the supplied transparent PDF icon without a gray tile or gutter. Keep the filename and file-size row.

**Why:** The user wants a readable, professional invoice page and a native-looking WhatsApp PDF attachment without implying a valid tax invoice.

**How to apply:** Use larger black text and neutral section styling in both the on-screen invoice and generated PDF. Keep the invoice line item to the product name without the fabric/length subline. Keep the viewer open until explicitly closed; preserve scrolling while hiding the scrollbar, and let the page use the available width. Preserve the clickable attachment row and clear preview/no-tax-claim disclaimers.

The order summary should omit the decorative check icon, use the requested invoice-style order-number format, and show the customer's name, phone, and complete delivery address below the total. Keep the Razorpay message visually consistent with the summary, with a plain heading and a clear payment action; place its timestamp after the action.

**Why:** The user wants both messages to read as clear, structured WhatsApp receipts and the customer details to appear with the price breakdown.

**How to apply:** Keep the same sample order ID across the chat, invoice preview, and payment context. Avoid icons in these two message headings and keep timestamps from overlapping action rows.

Remove the paid ORDER UPDATE module entirely, but keep the conversation replay action as a separate control.

**Why:** The user asked to remove the entire status module while preserving a way to replay the scripted showcase.

**How to apply:** Do not render the order number, processing status, or progress timeline after invoice delivery. Keep “Replay conversation” separate from the removed module.

Keep the saree base price separate from sample CGST, SGST, and delivery charges, and use the same computed payable total in the order summary, Razorpay simulation, payment confirmation, and sample invoice. Keep the revised payment confirmation warm and celebratory while preserving payment reference and method.

**Why:** The user asked for a visible charge breakdown and consistent total across the payment journey, plus a more personal paid message.

**How to apply:** Calculate in paise, show each charge as a separate row, and keep all GST/invoice language clearly illustrative and preview-only.

Message timestamps use a 12-hour time with AM/PM, matching normal WhatsApp.

**Why:** The user called out missing AM/PM as a difference from WhatsApp.

**How to apply:** Include AM/PM on every visible message, template, and bubble timestamp.

The phone should look like a WhatsApp iOS conversation rather than a generic chat: use the business header, chat wallpaper, outgoing and incoming bubble conventions, delivery/read details, and a composer anchored above the device safe area with plus, message field, camera, and microphone controls. Keep replay controls out of the composer.

Use the user's reference screenshot and the exact “Messages - Full view” Figma frame at https://www.figma.com/design/iv4OQSL1W7hEjQ2wlS8WdA/WhatsApp-Screens-2025-with-Meta-AI---UI-for-iOS--Community-?node-id=86-6042 as the primary visual reference. Open that frame itself, not just the board overview. When the user supplies an SVG export, use its available vectors as implementation assets instead of substituting generic icon-library or hand-drawn WhatsApp chrome. Check the file's license before reusing exported assets. Do not copy personal chat text or contact details from the screenshot.

For this public preview, keep the rounded bubble cards but omit the pointed tails; the user explicitly chose this to avoid the tail mismatch. The newer unread-message SVG keeps `#F5F2EB` as its base fill but references a wallpaper pattern without embedding a reusable definition.

The supplied SVGs outline their text instead of retaining font-family metadata, so the exact font cannot be recovered from the exports. Keep native iOS system fonts first and use the already-loaded Inter font as the non-Apple fallback; calibrate text sizes against the SVG's 393px width and the demo's 252px design canvas.

**Why:** The showcase must stay interactive and visually faithful; the user has repeatedly corrected icon-only matching and crop misalignment, emphasizing that typography, spacing, scale, and alignment matter too. The user chose clean rounded cards without directional tails even though the supplied SVG examples include tails, flagged the profile avatar as too small and misaligned, and asked to remove the back-count, center and inset the chevron, and tighten the contact group without moving call controls. The user confirmed the current login-page UI and structure are complete; preserve this as the approved baseline unless asked to change it. Commerce copy should feel realistic without visible “Demo” branding, while still clearly stating that the flow is preview-only. Keep outgoing read ticks close to the green bubble edge; a large trailing gap makes the sender message look misaligned. The payment gateway must look restrained and credible rather than playful or simplified. For checkout, the user prefers light surfaces and recognizable GPay/Paytm marks; sample GST must not imply a real tax invoice or merchant registration. Product-template text should be black and one WhatsApp-scale size, with emphasis through weight rather than size changes; left-align its price and put the timestamp above the separated action row.

**How to apply:** Treat the device as the customer's phone: business-sent templates, chatbot replies, receipts, payment links, payment confirmations, invoice attachments, and order updates are incoming left-side white bubbles with timestamps but no sender-side read ticks; customer messages are outgoing right-side green bubbles with read ticks. Keep the outgoing timestamp and ticks grouped near the bubble's right edge with only a small, consistent inset; avoid oversized right padding. When adding content to incoming business bubbles, reserve space so timestamps do not overlap the message or controls. Automatically run each scripted step without requiring visitors to type, tap, or submit; after the UPI checkout is visible briefly, auto-start its simulated Pay action while still allowing an earlier tap. Provide a replay path. Use clearly fabricated checkout details and keep payment interaction simulated. Remove visible “Demo” labels from checkout, payment, invoice, and replay copy, but retain a clear preview-only/no-real-payment-or-order notice. On product-template cards and chatbot product-detail replies, keep copy black at the regular WhatsApp text size and use bold weight for emphasis; left-align the product-template price, and align product-detail row values right, including the unpunctuated “Price” row. Put the incoming timestamp just above a divider and place Buy Now in a separated action row with a link icon. Show delivery estimates as a labeled “Delivery time” row. Use the proper Razorpay logo on a light neutral checkout surface, recognizable Google Pay/Paytm marks, merchant/amount context, selectable payment methods, UPI handoff, processing feedback, and a compact receipt. Any GST breakup or invoice must be labeled illustrative, avoid invented GSTINs, and clearly state that no valid tax invoice or payment was created. After the simulated payment, generate and expose the invoice PDF locally and show the paid/processing order state without calling payment, order, or messaging services. Before changing the phone UI, inspect the linked Figma frame and supplied SVG; match typography, spacing, proportions, rounded corners, and the exact background base fill. Keep the profile avatar prominent and vertically centered, with clear spacing before the contact name. Crop only the back chevron from the reference and center it with a small left inset; omit the adjacent unread count. Keep the avatar/contact group close to the chevron, but leave the video and phone icons fixed. Before finishing, compare the rendered phone with the reference at a similar viewport and check that the header subtitle, date pill, bubbles, card, and composer align and remain visible. Keep app-specific commerce content interactive; do not copy personal conversation text or call production messaging or payment services from this preview.

The commerce showcase should feel like one continuous scripted journey from the first product template through replay. Apply staged message reveals and smooth scrolling across all chat stages, plus coordinated entrance and exit motion for the Flow, Razorpay, and invoice screens. Respect reduced-motion preferences and defer heavy animation or invoice work until needed.

**Why:** The user clarified that motion should cover the whole process, not only payment, while keeping the current sequence and layout.

**How to apply:** Preserve the established copy and preview-only boundaries. Do not redesign the screens or add a separate success page. Use static feedback or near-instant transitions when reduced motion is enabled.

The login-page customer journey is page content, so use the Add Template module's Poppins typography scale rather than the tiny text sizing used inside the simulated phone.

**Why:** The user said the journey text was too small and specifically asked for the Add Template font with a larger text size.

**How to apply:** Keep the journey's headings and explanatory copy comfortably readable at desktop sizes. Compact it only as much as needed to fit shorter desktop viewports; do not reduce it back to microtext.

Center the sign-in content within its panel and keep it visually prominent. Omit decorative workspace labels, footer branding/copy, and the security reassurance row.

**Why:** The user asked for a larger, centered sign-in section and asked to remove those secondary labels and messages.

**How to apply:** Keep the welcome heading, explanatory sentence, credential fields, and submit button. Use the journey's Poppins type style and readable 15px-scale supporting text for the form controls.

Show the same full AtWassup brand logo used in the expanded workspace header, at a clearly large display size centered above the sign-in welcome text.

**Why:** The user asked for the existing header logo to be prominent and centered on the login panel, and corrected a version where it rendered too small.

**How to apply:** Reuse the full brand artwork rather than replacing it with typed text or the collapsed icon mark. Preserve a large visible mark at short desktop heights too; compact nearby spacing instead of shrinking the logo to icon size.