[![Run on Replit](https://replit.com/badge/github/rjslarx/iRescue-life)](https://replit.com/new/github/rjslarx/iRescue-life)

# iRescue.life 🐾

**"Epic" for Animal Rescues.** An open-source, medical-grade management platform for foster-based animal rescues.

[![Run on Replit](https://replit.com/badge/github/rjslarx/iRescue-life)](https://replit.com/new/github/rjslarx/iRescue-life)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

## 📊 The Command Center
<img width="100%" alt="iRescue Dashboard" src="https://github.com/user-attachments/assets/be1d806a-e741-43c4-a308-cc1350290875" />

## 🩺 The Story
I am a semi-retired hospital pharmacist and a volunteer at **Haseya’s New Beginning Animal Rescue**.

In my career, I saw how software like **Epic** revolutionized patient safety and hospital efficiency. But when I began volunteering in animal rescue, I saw dedicated people drowning in spreadsheets, missing medication doses, and struggling with "clunky" software that cost them money they didn't have.

**iRescue.life** is my attempt to bring **medical-grade safety and operational efficiency** to animal welfare. We are building a platform that treats a foster dog's heartworm protocol with the same seriousness as a hospital patient's treatment plan—but simple enough for a volunteer to use on their phone.

## 🚀 Key Features

### 🏥 Medical Compliance Engine
* **"Magic Link" Adherence:** Fosters receive SMS reminders with secure, one-click links to confirm meds were given. No login required.
* **Inventory Logic:** The system tracks pill counts and alerts staff *before* a foster runs out of medication.
* **Automated Protocols:** Assign a "Parvo Protocol" and generate 14 days of scheduled tasks instantly.

### 🎛 The Command Center
* **Exception-Based Dashboard:** Directors don't see what's going right; they see a "Red List" of what's going wrong (Overdue Meds, Pending Intakes).
* **Tenant-Based SaaS:** Built to support multiple rescues on one instance (Multi-tenant architecture).

### 📱 Foster & Adopter Experience
* **Mobile-First Portal:** A "My Fosters" app for uploading photos and writing bios.
* **Adopter Retention:** Automated "3-3-3 Rule" email sequences to prevent returns during the decompression period.

## 🛠 Tech Stack
* **Frontend:** React, Tailwind CSS, Shadcn UI
* **Backend:** Node.js, Express
* **Database:** PostgreSQL (via Neon/Replit)
* **Infrastructure:** Built and deployed on **Replit**

## 📍 Trusted in Production
**iRescue.life** is the daily operating system for **[Haseya's New Beginning Animal Rescue](https://www.haseyasnewbeginningar.com/)** in Rayne, Louisiana.

> "We moved from spreadsheets to iRescue and saved 15 hours of admin work per week. That's 15 more hours we spend with the dogs."
> — *Robert Stelly, Volunteer & Board Member*

**Live Stats:**
* **Active Fosters Managed:** 20+
* **Medical Records Tracked:** 200+
* **Uptime:** 99.9%

* ## 🚀 Getting Started

The easiest way to test or contribute to iRescue.life is directly in your browser using Replit. 

[![Run on Replit](https://replit.com/badge/github/rjslarx/iRescue-life)](https://replit.com/github/rjslarx/iRescue-life)

1. Click the button above to clone this project into your own free Replit workspace.
2. Open the **Secrets** panel in Replit (the padlock icon).
3. Add your API keys (see the `.env.example` file in the code for the list of required keys).
4. Hit the big **Run** button at the top! Replit will automatically install the database and start the server.

## 🤝 Contributing
We are actively looking for contributors! Whether you are a frontend wizard or a backend architect, help us save time for rescuers so they can save more lives.

**Good First Issues:**
* [ ] Refine the "Mobile Homepage" CSS.
* [ ] Add "Dark Mode" to the Admin Dashboard.
* [ ] Create email templates for the Adopter Journey.

## 📍 Pilot Site
Proudly piloting at **Haseya's New Beginning Animal Rescue** (Lafayette, LA).

---

*"Saving lives, one pull request at a time."*
