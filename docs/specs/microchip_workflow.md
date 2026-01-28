# Microchip & Registration Module - Technical Specification

**Version:** 1.0  
**Status:** Draft - Pending Approval  
**Last Updated:** January 28, 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [Phase 1: Intake Logic (Scan Workflow)](#phase-1-intake-logic-scan-workflow)
4. [Phase 2: Adoption Logic (Queue Workflow)](#phase-2-adoption-logic-queue-workflow)
5. [Phase 3: Safety Nets & Compliance](#phase-3-safety-nets--compliance)
6. [API Endpoints](#api-endpoints)
7. [UI Components](#ui-components)
8. [Future Enhancements](#future-enhancements)

---

## Overview

### Purpose
The Microchip & Registration Module provides end-to-end management of animal microchips from intake through adoption. It ensures proper registration, tracks ownership transfers, and prevents compliance gaps in the adoption process.

### Key Features
- Microchip data capture during intake
- Universal lookup integration with petmicrochiplookup.org
- Automatic task generation for ownership transfers
- Clipboard copy helper for adopter information
- Compliance gates preventing incomplete adoptions

---

## Database Schema

### Strategy Decision: Separate Table vs. Animal Columns

**Recommendation: Create a dedicated `microchip_records` table**

**Rationale:**
- Animals may have multiple microchips (e.g., previous chip + rescue-implanted chip)
- Enables full audit trail of registration status changes
- Supports future features like chip history/transfer logs
- Cleaner separation of concerns from the main animals table

### Table: `microchip_records`

```sql
CREATE TABLE microchip_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id UUID NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Core Microchip Data
  microchip_number VARCHAR(50) NOT NULL,
  manufacturer TEXT NOT NULL, -- Enum values validated at app layer
  
  -- Implant Information
  implant_date DATE,
  implant_location TEXT DEFAULT 'Between Shoulder Blades',
  implanted_by UUID REFERENCES users(id), -- Staff who implanted (if done in-house)
  
  -- Registration Status
  registration_status TEXT NOT NULL DEFAULT 'unregistered',
  is_rescue_backup BOOLEAN DEFAULT FALSE,
  
  -- Origin Tracking
  chip_origin TEXT NOT NULL DEFAULT 'found', -- 'implanted_by_rescue' | 'found' | 'transferred_in'
  
  -- Transfer Tracking
  transferred_at TIMESTAMP,
  transferred_by UUID REFERENCES users(id),
  transfer_verified BOOLEAN DEFAULT FALSE,
  transfer_notes TEXT,
  
  -- Audit Fields
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_chip_per_tenant UNIQUE (tenant_id, microchip_number)
);

-- Indexes for performance
CREATE INDEX idx_microchip_animal ON microchip_records(animal_id);
CREATE INDEX idx_microchip_number ON microchip_records(microchip_number);
CREATE INDEX idx_microchip_tenant ON microchip_records(tenant_id);
CREATE INDEX idx_microchip_status ON microchip_records(registration_status);
```

### Enum Definitions

#### Manufacturer Options
| Value | Display Name |
|-------|-------------|
| `homeagain` | HomeAgain |
| `24petwatch` | 24PetWatch |
| `fi` | Fi |
| `akc` | AKC Reunite |
| `avid` | AVID |
| `foundanimals` | Found Animals (Found.org) |
| `other` | Other/Unknown |

#### Registration Status
| Value | Display Name | Description |
|-------|-------------|-------------|
| `unregistered` | Unregistered | Chip exists but not registered to anyone |
| `registered_rescue` | Registered to Rescue | Rescue is primary contact |
| `found_unknown` | Found/Unknown | Pre-existing chip, original owner unknown |
| `transferred` | Transferred to Adopter | Ownership transferred post-adoption |

#### Chip Origin
| Value | Display Name | Description |
|-------|-------------|-------------|
| `implanted_by_rescue` | Implanted by Rescue | We implanted this chip |
| `found` | Found on Animal | Animal arrived with chip |
| `transferred_in` | Transferred In | Chip registration transferred to us from another org |

### Drizzle Schema (TypeScript)

```typescript
export const microchipRecords = pgTable("microchip_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  animalId: uuid("animal_id").notNull().references(() => animals.id, { onDelete: 'cascade' }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  
  // Core Microchip Data
  microchipNumber: varchar("microchip_number", { length: 50 }).notNull(),
  manufacturer: text("manufacturer").notNull(), // homeagain, 24petwatch, fi, akc, avid, foundanimals, other
  
  // Implant Information
  implantDate: date("implant_date"),
  implantLocation: text("implant_location").default("Between Shoulder Blades"),
  implantedBy: uuid("implanted_by").references(() => users.id),
  
  // Registration Status
  registrationStatus: text("registration_status")
    .notNull()
    .default("unregistered")
    .$type<"unregistered" | "registered_rescue" | "found_unknown" | "transferred">(),
  isRescueBackup: boolean("is_rescue_backup").default(false),
  
  // Origin Tracking
  chipOrigin: text("chip_origin")
    .notNull()
    .default("found")
    .$type<"implanted_by_rescue" | "found" | "transferred_in">(),
  
  // Transfer Tracking
  transferredAt: timestamp("transferred_at"),
  transferredBy: uuid("transferred_by").references(() => users.id),
  transferVerified: boolean("transfer_verified").default(false),
  transferNotes: text("transfer_notes"),
  
  // Audit Fields
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

---

## Phase 1: Intake Logic (Scan Workflow)

### User Story
> As an intake coordinator, I need to record microchip information when an animal arrives so we can verify ownership and ensure proper registration.

### Intake Wizard Integration

#### Location in Wizard
Add "Microchip" section as a collapsible panel within the existing Intake Wizard, positioned after "Basic Info" and before "Medical Intake."

#### UI Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Microchip Information                                      [−]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Does this animal have a microchip?                            │
│  ○ Yes, found existing chip                                    │
│  ○ Yes, we will implant one                                    │
│  ○ No / Unknown                                                │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Microchip Number *                                            │
│  ┌─────────────────────────────────────────┐  ┌──────────────┐ │
│  │ 985112345678901                          │  │ 🔍 Lookup    │ │
│  └─────────────────────────────────────────┘  └──────────────┘ │
│                                                                 │
│  Manufacturer *                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ HomeAgain                                            ▼  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐  │
│  │ Implant Date            │  │ Implant Location            │  │
│  │ ┌───────────────────┐   │  │ ┌─────────────────────────┐ │  │
│  │ │ 01/28/2026     📅 │   │  │ │ Between Shoulder Blades │ │  │
│  │ └───────────────────┘   │  │ └─────────────────────────┘ │  │
│  └─────────────────────────┘  └─────────────────────────────┘  │
│                                                                 │
│  ☑ Rescue is listed as secondary/backup contact                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Universal Lookup Feature

#### "Quick Link" Button Behavior
When user clicks the **🔍 Lookup** button:

1. Validate that microchip number is at least 9 digits
2. Open new browser tab/window to:
   ```
   https://www.petmicrochiplookup.org/?search={microchip_number}
   ```
3. Display toast: "Opening universal microchip lookup..."

#### Implementation
```typescript
const handleLookupClick = (microchipNumber: string) => {
  if (microchipNumber.length < 9) {
    toast.error("Enter at least 9 digits to search");
    return;
  }
  window.open(
    `https://www.petmicrochiplookup.org/?search=${encodeURIComponent(microchipNumber)}`,
    '_blank'
  );
};
```

### Automatic Status Logic

#### Scenario: Found Existing Chip (Stray/Surrender)
```
IF chip_origin = 'found'
THEN registration_status = 'found_unknown'
```

#### Scenario: Rescue Implants New Chip
```
IF chip_origin = 'implanted_by_rescue'
THEN registration_status = 'registered_rescue'
AND implant_date = current_date
AND implanted_by = current_user
```

### Validation Rules

| Field | Rule |
|-------|------|
| microchip_number | Required if chip exists; 9-15 alphanumeric chars |
| manufacturer | Required if chip exists |
| implant_date | Required if implanted_by_rescue; cannot be future |
| implant_location | Defaults to "Between Shoulder Blades" |

---

## Phase 2: Adoption Logic (Queue Workflow)

### User Story
> As an admin, I need the system to remind me to transfer microchip registration when an animal is adopted, and provide an easy way to copy adopter details for external registries.

### Trigger Event

**When:** Animal status changes to `adopted`  
**Condition:** Animal has at least one microchip record with `registration_status != 'transferred'`

### Automatic Task Generation

#### Task Creation Logic
```typescript
// Triggered by adoption status change
async function onAnimalAdopted(animalId: string, adopterId: string) {
  const microchips = await db.query.microchipRecords.findMany({
    where: and(
      eq(microchipRecords.animalId, animalId),
      ne(microchipRecords.registrationStatus, 'transferred')
    )
  });
  
  if (microchips.length > 0) {
    await createAdminTask({
      tenantId: animal.tenantId,
      taskType: 'microchip_transfer',
      title: 'Transfer Microchip Registration',
      description: `Transfer microchip ${microchips[0].microchipNumber} to new adopter`,
      priority: 'high',
      relatedAnimalId: animalId,
      relatedApplicationId: adoptionApplicationId,
      dueDate: addDays(new Date(), 7), // Due within 7 days
      metadata: {
        microchipId: microchips[0].id,
        adopterId: adopterId,
        manufacturer: microchips[0].manufacturer
      }
    });
  }
}
```

#### Task UI Appearance
The task appears in:
- **Action Center Widget** on Command Center dashboard
- **Admin Tasks** list with "Microchip" category filter
- **Animal Detail** page under pending actions

### Copy Helper Feature

#### Location
Available in two places:
1. **Admin Task Detail** - When viewing the transfer task
2. **Animal Medical Tab** - Under microchip section after adoption

#### UI Design

```
┌─────────────────────────────────────────────────────────────────┐
│ Transfer Microchip Registration                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Microchip: 985112345678901 (HomeAgain)                        │
│  Animal: Luna (A-2024-0456)                                    │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ADOPTER INFORMATION                                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Jane Smith                                               │   │
│  │ 123 Main Street                                          │   │
│  │ Phoenix, AZ 85001                                        │   │
│  │ Phone: (555) 123-4567                                    │   │
│  │ Email: jane.smith@email.com                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌────────────────────┐  ┌────────────────────────────────┐   │
│  │ 📋 Copy to Clipboard│  │ 🔗 Open HomeAgain Registration │   │
│  └────────────────────┘  └────────────────────────────────┘   │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ☐ I have completed the microchip transfer                     │
│  Notes: ___________________________________________________    │
│                                                                 │
│         ┌──────────────────────┐                               │
│         │ Mark Transfer Complete│                               │
│         └──────────────────────┘                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Clipboard Format
When "Copy to Clipboard" is clicked, format adopter info for easy pasting:

```
Name: Jane Smith
Address: 123 Main Street, Phoenix, AZ 85001
Phone: (555) 123-4567
Email: jane.smith@email.com
```

#### Registry Quick Links
Based on manufacturer, show appropriate link:

| Manufacturer | URL |
|--------------|-----|
| HomeAgain | https://www.homeagain.com/pet-owner-registration.html |
| 24PetWatch | https://www.24petwatch.com/us/pet-registration |
| AKC Reunite | https://www.akcreunite.org/register/ |
| Found Animals | https://www.found.org/register |
| Fi | https://tryfi.com/activate |
| AVID | https://avidid.com/pet-registration/ |

---

## Phase 3: Safety Nets & Compliance

### Compliance Check Feature

#### Purpose
Prevent adoption records from being marked as "Closed/Complete" until microchip transfer is verified.

#### Implementation

##### Adoption Pipeline Stages
Current flow:
```
new → screening → approved → adoption_pending → in_trial → adopted → [CLOSED]
```

Enhanced flow with compliance gate:
```
adopted → compliance_check → closed
```

##### Compliance Requirements
An adoption can only move to `closed` when ALL are true:

| Requirement | Check |
|-------------|-------|
| Microchip Transferred | `microchip_records.transfer_verified = true` OR `no microchip exists` |
| Contract Signed | `adoption_contracts.signed_at IS NOT NULL` |
| Fees Collected | `adoption_applications.fees_paid = true` |

##### UI Behavior

**If compliance requirements not met:**
```
┌─────────────────────────────────────────────────────────────────┐
│ ⚠️ Cannot Close Adoption                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ The following items must be completed before closing:           │
│                                                                 │
│ ✓ Adoption contract signed                                     │
│ ✓ Adoption fees collected                                      │
│ ✗ Microchip transfer verified                                  │
│                                                                 │
│ ┌─────────────────────────────┐                                │
│ │ Complete Microchip Transfer │                                │
│ └─────────────────────────────┘                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Admin Override (with audit trail):**
Admins/Owners can override compliance with a reason:
- "Adopter will complete transfer themselves"
- "Chip not required by state"
- "Other" (requires notes)

Override is logged in `compliance_overrides` table for audit purposes.

##### Compliance Override Table
```sql
CREATE TABLE compliance_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  entity_type TEXT NOT NULL, -- 'adoption'
  entity_id UUID NOT NULL,
  requirement_type TEXT NOT NULL, -- 'microchip_transfer'
  override_reason TEXT NOT NULL,
  override_notes TEXT,
  overridden_by UUID NOT NULL REFERENCES users(id),
  overridden_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Reporting & Auditing

#### Dashboard Metrics
Add to Command Center:
- "Pending Microchip Transfers" count
- "Overdue Transfers (>7 days)" alert

#### Compliance Report
New report under Reports section:
- Animals with unregistered chips
- Pending transfers by age
- Override audit log

---

## API Endpoints

### Microchip CRUD

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/animals/:animalId/microchips` | List all microchips for animal |
| POST | `/api/animals/:animalId/microchips` | Create new microchip record |
| PATCH | `/api/microchips/:id` | Update microchip record |
| DELETE | `/api/microchips/:id` | Delete microchip record |
| POST | `/api/microchips/:id/verify-transfer` | Mark transfer as verified |

### Compliance

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/adoptions/:id/compliance` | Check compliance status |
| POST | `/api/adoptions/:id/compliance/override` | Create compliance override |

---

## UI Components

### New Components to Create

1. **MicrochipSection.tsx** - Display/edit microchips on Animal Medical tab
2. **MicrochipIntakePanel.tsx** - Collapsible panel for Intake Wizard
3. **MicrochipTransferTask.tsx** - Task detail view with copy helper
4. **AdopterCopyHelper.tsx** - Reusable clipboard copy component
5. **ComplianceGate.tsx** - Modal showing compliance requirements

### Modified Components

1. **IntakeWizard.tsx** - Add microchip step
2. **AnimalMedicalPage.tsx** - Add microchip section
3. **AdoptionKanban.tsx** - Add compliance indicators
4. **ActionCenterWidget.tsx** - Include microchip transfer tasks

---

## Future Enhancements

### Phase 4 (Future)
- **Bulk chip import** from scanner device
- **Auto-registration API** for HomeAgain/24PetWatch partners
- **Chip verification scanner** integration
- **Transfer history timeline** with all ownership changes
- **State compliance reporting** for jurisdictions requiring microchip reports

---

## Implementation Checklist

- [ ] Create `microchip_records` table schema
- [ ] Run database migration
- [ ] Create API endpoints (CRUD + verify-transfer)
- [ ] Add MicrochipSection to Animal Medical tab
- [ ] Integrate into Intake Wizard
- [ ] Implement adoption trigger for task generation
- [ ] Build Copy Helper UI
- [ ] Add compliance gate to adoption workflow
- [ ] Create compliance override system
- [ ] Add dashboard metrics
- [ ] Write tests

---

## Approval

**Please review this specification and confirm approval before implementation begins.**

Questions to consider:
1. Should we support multiple microchips per animal (recommended: yes)?
2. Is the 7-day due date for transfer tasks appropriate?
3. Should admins be able to override compliance requirements?
4. Any additional manufacturers to include?
