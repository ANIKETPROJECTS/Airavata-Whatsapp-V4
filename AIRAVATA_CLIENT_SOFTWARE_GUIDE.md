# Airavata WhatsApp Solution

## Client Demonstration and User Guide

Airavata is a WhatsApp customer-engagement and business-automation platform. It helps a business manage customer conversations, organize contacts, send WhatsApp campaigns, create automated chatbots, manage WhatsApp templates, and monitor usage from one workspace.

This document can be used as:

- A client demonstration script
- A quick-start guide for new users
- A reference for explaining each module
- A checklist for onboarding a business

---

## 1. What Airavata Helps a Business Do

With Airavata, a business can:

1. Connect its WhatsApp Business account.
2. Receive and respond to customer messages from one Live Chat inbox.
3. Import and organize contacts.
4. Create groups and tags for customer segmentation.
5. Send targeted WhatsApp campaigns.
6. Schedule follow-up or drip campaigns.
7. Send approved WhatsApp message templates.
8. Build automated chatbots and conversation flows.
9. Create WhatsApp forms and flow-based experiences.
10. Maintain a product or service catalogue.
11. Monitor message usage and credit consumption.
12. Receive notifications for important events and failures.
13. Manage users, permissions, connections, credits, and reports from the Master Admin panel.

The main benefit is that customer communication, marketing, automation, and reporting are available in one controlled workspace instead of being spread across multiple tools.

---

## 2. User Roles

### Workspace User

A workspace user manages the daily operations of one business:

- Conversations
- Contacts
- Campaigns
- Templates
- Chatbots
- Catalogue items
- Groups and tags
- Credits
- Workspace settings

Access can be limited by permission. For example, one user may only receive access to Live Chat and Contacts, while another user may also manage campaigns and templates.

### Master Admin

The Master Admin manages the entire Airavata installation:

- Create and edit user accounts
- Activate or deactivate accounts
- Assign Client or Admin roles
- Control section-level access
- Connect WhatsApp accounts for selected users
- Review user reports
- Configure credit rates
- Add or deduct credits
- Review credit transactions
- View platform analytics
- Disconnect WhatsApp accounts
- Delete user workspaces when required

---

## 3. Getting Started

### Step 1: Create an Account

The user provides:

- Business name
- Email address
- Phone number
- Password
- Password confirmation

The phone number is used as part of the business workspace identity and helps distinguish users with similar business names.

### Step 2: Sign In

Use the registered email address and password to sign in. After successful login, the user is taken to the Dashboard.

### Step 3: Connect WhatsApp

Open **Integration** and connect the business WhatsApp account through the Facebook/Meta connection flow.

Once connected, the workspace can use WhatsApp features such as:

- Receiving customer messages
- Sending replies
- Sending approved templates
- Running campaigns
- Processing WhatsApp webhooks
- Using chatbot and flow automation

### Step 4: Complete the Workspace Setup

Recommended setup order:

1. Add or import Contacts.
2. Create Groups or Tags.
3. Add products or services to the Catalogue.
4. Review or add WhatsApp Templates.
5. Create a chatbot or flow if automation is required.
6. Create a small test campaign.
7. Review Credits before sending messages to a large audience.

---

## 4. Dashboard

The Dashboard provides a quick overview of workspace health and activity.

It helps the user understand:

- Contact and conversation activity
- Campaign status
- Template status
- Chatbot status
- Message usage
- Credit balance
- Recent operational activity

The Dashboard is useful during a client demonstration because it gives an immediate summary of what is happening in the account.

### Dashboard Status Examples

#### Campaigns

- Running
- Scheduled
- Failed
- Completed, depending on the campaign state

#### Templates

- Applied or approved
- Pending
- Failed or rejected

#### Chatbots

- Published
- Draft
- Failed

The Dashboard allows the client to identify issues without opening every module individually.

---

## 5. Live Chat

Live Chat is the central inbox for customer conversations.

### Main Uses

- View incoming WhatsApp messages
- Search for a customer
- Open a conversation
- Reply to customers
- Send media or supported message content
- Review conversation history
- See whether a conversation is active or resolved
- Identify unread inbound activity

### Suggested Live Chat Workflow

1. Open **Live Chat**.
2. Select a customer conversation.
3. Read the recent conversation history.
4. Reply directly from the workspace.
5. Resolve the conversation when the issue is complete.
6. Reopen or continue the conversation if the customer sends a new message.

Unread status is based on actual inbound customer activity. New inbound messages can make a previously resolved conversation active again.

### Client Value

The business does not need to switch between personal phones, multiple browser tabs, and separate team members to handle customer replies. The conversation history remains available in the workspace.

---

## 6. Contacts

The Contacts module is the customer database for the WhatsApp workspace.

### Contact Information

Contacts may include:

- Name
- Phone number
- Email address
- Groups
- Tags
- Conversation activity
- Campaign participation
- Status information

### Contact Management Features

- Add contacts individually
- Edit contact details
- Delete contacts
- Search by name or phone number
- Import contacts from CSV
- Assign groups
- Add tags
- Review customer engagement information

### CSV Import

The standard CSV import should include:

```text
name,phone,email
```

The `name` and `phone` columns are the core fields. Email is optional.

### Client Demonstration Example

Import a list of existing customers, assign a tag such as `VIP` or `New Lead`, and use that segment in a later campaign.

---

## 7. Groups and Tags

Groups and tags help organize a large customer list.

### Groups

Groups are useful for broader customer categories, such as:

- Retail customers
- Wholesale customers
- Delhi customers
- Service subscribers
- Event attendees

### Tags

Tags are useful for flexible labels, such as:

- VIP
- New Lead
- Follow-up Required
- Interested in Product A
- Payment Pending

### Why Segmentation Matters

Segmentation allows the business to send a relevant message to the right audience instead of sending the same message to every contact.

For example:

> Send a new-product announcement to customers tagged `Interested in Product A`, rather than sending it to the entire database.

---

## 8. Campaigns

Campaigns are used to send WhatsApp messages to a selected audience.

Airavata supports multiple campaign approaches so the business can choose the right method for the situation.

### Campaign Types

#### Quick Campaign

Use for a straightforward one-time message to a selected set of contacts.

#### CSV Campaign

Use when the recipient list is provided through a CSV file.

#### Group Campaign

Use to target all or selected contacts in a group.

#### Tag Campaign

Use to target contacts with a specific tag.

#### Segment Campaign

Use filters to create a more focused audience.

#### Trigger Campaign

Use an event or condition to start communication.

#### Drip Campaign

Use multiple messages or steps with configured delays between them.

#### Flow Campaign

Use a WhatsApp flow or form experience as part of the campaign.

### Typical Campaign Process

1. Open **Create Campaign**.
2. Select the campaign type.
3. Enter a campaign name.
4. Select or import the audience.
5. Choose an approved WhatsApp template when required.
6. Configure message values and variables.
7. Review the recipients.
8. Schedule or start the campaign.
9. Monitor the result in **Campaigns Report**.

### Campaign Safety

Before sending a large campaign:

- Verify the recipient audience.
- Check the template content.
- Confirm the message category.
- Confirm the available credits.
- Send a small test first where possible.

---

## 9. Campaigns Report

Campaigns Report provides visibility into campaign execution.

The user can review:

- Campaign name
- Audience
- Campaign status
- Delivery activity
- Message outcomes
- Failed sends
- Campaign timing

Campaign reports help the business understand whether a campaign was successfully processed and which messages may need attention.

### Useful Client Questions Answered

- Which campaigns are running?
- Which campaigns are scheduled?
- Which campaigns failed?
- Which customers were targeted?
- Are there delivery failures?
- Does the campaign need to be retried or reviewed?

---

## 10. WhatsApp Templates

WhatsApp templates are pre-approved message formats used for business-initiated communication and other situations where a template is required.

### Manage Templates

Use **Manage Templates** to:

- View existing templates
- Review template status
- Identify pending templates
- Identify rejected templates
- Check available template information

### Add Template

Use **Add Template** to create a new message template.

The template builder supports message content such as:

- Text
- Image
- Video
- Document
- Authentication or OTP content
- Quick replies
- Call-to-action buttons

### Template Categories

#### Marketing

For promotions, offers, product announcements, and marketing communication.

#### Utility

For order updates, service alerts, account notifications, and operational messages.

#### Authentication

For OTPs, verification, and account security messages.

### Template Workflow

1. Create the template.
2. Select the category.
3. Add the message body and variables.
4. Add optional media or buttons.
5. Submit the template through the WhatsApp/Meta integration.
6. Wait for approval.
7. Use the approved template in campaigns or customer communication.

Pending and rejected templates can generate notifications so the user does not have to repeatedly check the template page.

---

## 11. Chatbot

The Chatbot module lets the business build automated WhatsApp conversations using a visual flow builder.

### What a Chatbot Can Do

- Welcome a customer
- Ask questions
- Collect customer information
- Offer selectable options
- Route a conversation based on a condition
- Send text or media
- Display a catalogue or service option
- Trigger a follow-up action
- End a conversation with a completion message

### Flow Builder Concepts

#### Nodes

Nodes represent actions or steps in the conversation.

Examples include:

- Start
- Text message
- User input
- Selection
- Condition
- Media
- WhatsApp flow
- End

#### Connections

Connections define what happens next after each node.

#### Conditions

Conditions can route customers through different branches. For example:

- If the customer selects “Order status”, show order-status options.
- If the customer selects “Talk to an agent”, route the conversation to Live Chat.

### Chatbot Workflow

1. Create a new flow.
2. Give the flow a meaningful name.
3. Add the first conversation node.
4. Add questions, messages, and options.
5. Connect the nodes in the correct order.
6. Add true and false branches for conditions.
7. Test the flow.
8. Save it as a draft or publish it.

Published flows can be used as part of WhatsApp automation and campaigns.

---

## 12. WhatsApp Flows and Forms

WhatsApp flows provide a structured form-like experience inside WhatsApp.

They are useful when the business needs to collect information in a consistent format.

Possible use cases include:

- Lead capture
- Appointment requests
- Service booking
- Vehicle or customer information
- Delivery details
- Support requests
- Feedback forms

A flow can collect fields such as:

- Name
- Mobile number
- Date
- Time
- Notes
- Choice selections

The submitted information can be used by the business for follow-up and operational processing.

---

## 13. Catalogue

The Catalogue module helps the business maintain products or services that can be referenced in customer communication.

### Catalogue Uses

- Add products or services
- Maintain names and descriptions
- Store pricing information
- Organize the offerings shown to customers
- Support chatbot and WhatsApp sales conversations

### Example

A salon can add:

- Haircut
- Hair coloring
- Facial
- Bridal package

A retailer can add:

- Product name
- Product price
- Product description
- Product category

The Catalogue is especially useful when combined with Chatbot flows and WhatsApp conversations.

---

## 14. WhatsApp Pay

The WhatsApp Pay section is intended for payment-related configuration and transaction visibility.

Depending on the connected payment provider and account setup, the user can:

- Connect a payment provider
- Review payment settings
- View recent transactions

This module should be configured only after confirming the supported payment provider and the business payment requirements.

---

## 15. Manage Workspace

The **Manage** section contains workspace administration tools.

It can be used for:

- Managing API keys
- Reviewing workspace preferences
- Managing Live Chat settings
- Managing campaign-related settings
- Managing contact-related settings
- Managing template-related settings
- Importing service pricing catalogues
- Reviewing operational configuration

### API Keys

API keys are useful when an external system needs to communicate with the Airavata workspace.

For security:

- Create a separate key for each external application.
- Use a descriptive label.
- Do not share keys in chat or public documents.
- Revoke keys that are no longer required.

### Service Pricing Catalogue

Businesses can maintain service pricing information in the workspace and import pricing data from an Excel file when needed.

This is useful for:

- Service quotations
- Chatbot pricing responses
- Standardizing service rates
- Updating multiple prices at once

---

## 16. Credits and Usage

Credits help the business track message usage and account consumption.

The **Credits** section provides:

- Current credit balance
- Monthly usage
- Credit history
- Usage-related information

### Credit Categories

Message rates can be configured by category:

- Authentication
- Utility
- Marketing

Template messages use the rate associated with their category. Non-template session messages remain free under the current credit policy.

### Good Operating Practice

Before launching a large campaign:

1. Check the available credit balance.
2. Confirm the category rate.
3. Estimate the audience size.
4. Test the campaign with a small audience.
5. Review the balance after sending.

---

## 17. Notifications

The notification center keeps the user informed about real workspace events.

Notifications can be generated for:

- Inbound customer messages
- Failed outbound messages
- Failed campaigns
- Pending templates
- Rejected templates

### Notification Features

- Unread count on the notification bell
- Recent notification preview
- Mark one notification as read
- Mark all notifications as read
- Search notifications
- Filter by notification type
- Filter by read or unread state
- Sort by newest or oldest
- Open the related section from a notification

For example, clicking a rejected-template notification can take the user to the Templates section for review.

---

## 18. Profile

The Profile section allows the signed-in user to review and manage account information.

Typical profile information includes:

- Business name
- Email address
- Phone number
- Time zone
- Account security settings

Users should keep their business and contact information up to date so that the account remains easy to identify and manage.

---

## 19. Master Admin Panel

The Master Admin panel is the platform control center.

### Overview

Shows a summary of:

- Total users
- Active users
- Connected accounts
- Credit activity
- Recent platform activity

### User Management

Master Admin can:

- Add a user
- Edit a user
- Change a user’s role
- Enable or disable an account
- Set section permissions
- Update a password
- Search and filter users
- View account status
- Delete a user workspace

New user records require:

- Business name
- Valid email
- 10-digit phone number
- Password

### Connections

The Connections section shows which users have connected WhatsApp accounts.

Master Admin can:

- Connect Facebook/WhatsApp for a selected user
- Reconnect an account
- Review connection identifiers
- Disconnect an account

Credentials remain managed by the system and are not displayed as plain text in the panel.

### User Reports

Each user can have a detailed report showing:

- Account information
- Credit balance
- Usage totals
- Recent transactions
- Message or workspace activity

### Credit Rates

Master Admin can configure rates for:

- Authentication messages
- Utility messages
- Marketing messages

Rates are limited to valid whole-number values.

### Credit Transactions

The transaction area provides an audit trail for:

- Credit additions
- Adjustments
- Deductions
- Refunds

Manual credit changes should always include a clear reason.

### Analytics

Analytics helps the administrator review:

- User growth and account activity
- Active and inactive accounts
- Connected and unconnected accounts
- Credit purchases
- Credit usage
- Daily activity
- Transaction mix
- Highest-usage accounts

---

## 20. Account and Data Isolation

Each user workspace is isolated from other user workspaces.

The system maintains:

- A central account and administration area
- A separate tenant workspace database for each user
- Tenant-specific contacts, messages, campaigns, templates, chatbots, catalogue data, and notifications

Tenant access is resolved from the authenticated user or the verified WhatsApp connection owner. Users do not select another user’s database from the interface.

When a business name is changed through Master Admin:

1. The existing workspace is copied to the new tenant database name.
2. All tenant collections are verified.
3. The stored workspace reference is updated.
4. The old database is removed only after successful verification.

This keeps the workspace recognizable while protecting existing data during administrative changes.

---

## 21. Recommended Client Demonstration Flow

Use the following sequence for a clear product showcase.

### Demonstration Part 1: Dashboard

Explain that the Dashboard provides a summary of business communication, campaign, template, chatbot, and credit activity.

### Demonstration Part 2: Live Chat

Open a conversation and show:

- Customer history
- Unread state
- Replying to the customer
- Resolving the conversation

### Demonstration Part 3: Contacts

Show how to:

- Search for a customer
- Edit contact information
- Assign a tag or group
- Import a contact list

### Demonstration Part 4: Campaign

Create a test campaign:

1. Choose a campaign type.
2. Select a group or tag.
3. Choose a template.
4. Review the audience.
5. Schedule or send the campaign.
6. Open Campaigns Report.

### Demonstration Part 5: Templates

Show the difference between:

- Marketing templates
- Utility templates
- Authentication templates

Explain that templates may require approval before they can be used.

### Demonstration Part 6: Chatbot

Create a simple flow:

1. Welcome message
2. Customer choice
3. Conditional branch
4. Information collection
5. Completion message

### Demonstration Part 7: Catalogue

Add a sample product or service and explain how it can support customer queries and automated conversations.

### Demonstration Part 8: Credits

Show:

- Current balance
- Monthly usage
- Credit history
- Category-based rates

### Demonstration Part 9: Notifications

Show how a user can identify:

- A failed campaign
- A rejected template
- A new inbound message

Then open the related module directly from the notification.

### Demonstration Part 10: Master Admin

For an administrator audience, show:

- Creating a user
- Assigning permissions
- Connecting WhatsApp for a user
- Reviewing reports
- Managing credits
- Reviewing analytics

---

## 22. Practical Business Use Cases

### Lead Generation

1. Import or collect leads through a WhatsApp Flow.
2. Apply a `New Lead` tag.
3. Send a follow-up template.
4. Assign interested leads to a sales group.
5. Continue the conversation in Live Chat.

### Customer Support

1. Receive a customer message.
2. Use a chatbot to collect the issue type.
3. Route complex issues to Live Chat.
4. Respond from the shared inbox.
5. Resolve the conversation after completion.

### Promotions

1. Create a marketing template.
2. Wait for approval.
3. Select customers by group or tag.
4. Send a campaign.
5. Review delivery and failures in Campaigns Report.

### Appointment Booking

1. Create a WhatsApp Flow with name, phone, date, and time.
2. Publish the flow.
3. Use it in a campaign or chatbot.
4. Review responses and follow up with customers.

### Service Business

1. Import service pricing.
2. Maintain services in the Catalogue.
3. Build a chatbot that answers pricing questions.
4. Route booking requests to the support team.

---

## 23. Best Practices

### Messaging

- Keep messages clear and relevant.
- Use customer segmentation.
- Avoid sending unnecessary broadcasts.
- Test templates and variables before a campaign.
- Review delivery failures promptly.

### Contacts

- Keep phone numbers accurate.
- Remove duplicate or outdated records.
- Use consistent group and tag naming.
- Import clean CSV files.

### Chatbots

- Keep the first menu simple.
- Always provide a route to a human agent where appropriate.
- Make condition branches clear.
- Test every branch before publishing.
- Use meaningful flow names.

### Campaigns

- Start with a small test audience.
- Verify the campaign category and template.
- Check the credit balance first.
- Use reports to review results.

### Administration

- Give users only the permissions they need.
- Deactivate accounts that should no longer have access.
- Review credit transactions regularly.
- Use clear reasons for manual credit adjustments.
- Keep WhatsApp connections associated with the correct business user.

---

## 24. Quick Reference

| Requirement | Recommended Module |
|---|---|
| Reply to customers | Live Chat |
| Add or import customers | Contacts |
| Organize customers | Groups and Tags |
| Send a broadcast | Create Campaign |
| Review campaign results | Campaigns Report |
| Create approved message content | Add Template |
| Review template status | Manage Templates |
| Build automated conversations | Chatbot |
| Collect structured information | WhatsApp Flows |
| Manage products or services | Catalogue |
| Review payments | WhatsApp Pay |
| Manage workspace settings | Manage |
| Check balance and usage | Credits |
| Review important events | Notifications |
| Manage the signed-in account | Profile |
| Manage all users and platform settings | Master Admin |

---

## 25. Suggested Closing Statement for a Client

> Airavata brings WhatsApp conversations, customer management, campaigns, templates, automation, and reporting into one workspace. Your team can respond to customers, send targeted communication, automate repetitive questions, manage products or services, and track usage from a single platform. Administrators retain control over users, permissions, WhatsApp connections, credits, and reports, while each business workspace remains isolated and secure.
