import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  TransportEvent,
  TransportManifestItem,
  TransportStop,
  TransportParticipant,
  Animal,
  VaccineRecord,
  MicrochipRecord,
  MedicalExam,
} from "@shared/schema";

interface ManifestItemWithMedical extends TransportManifestItem {
  animal?: Animal | null;
  vaccines: VaccineRecord[];
  microchips: MicrochipRecord[];
  exams: MedicalExam[];
}

interface DriverPacketData {
  transport: TransportEvent;
  participants: TransportParticipant[];
  stops: TransportStop[];
  manifest: ManifestItemWithMedical[];
  organization: { name: string; phone: string | null; email: string | null };
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "N/A";
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getNeuterStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "spayed": return "Spayed";
    case "neutered": return "Neutered";
    case "intact": return "Intact";
    default: return "Unknown";
  }
}

function MasterManifestPage({
  data,
}: {
  data: DriverPacketData;
}) {
  const { transport, participants, stops, manifest, organization } = data;
  const drivers = participants.filter((p) => p.role === "driver");
  const coordinators = participants.filter((p) => p.role === "coordinator");
  const emergencyContacts = [
    ...coordinators,
    ...participants.filter((p) => p.role !== "driver" && p.role !== "coordinator"),
  ];

  return (
    <div className="packet-page" data-testid="packet-master-manifest">
      <div className="packet-header">
        <h1 className="packet-title">{organization.name}</h1>
        <h2 className="packet-subtitle">Transport Driver Packet</h2>
      </div>

      <div className="packet-section">
        <h3 className="packet-section-title">Transport Details</h3>
        <table className="packet-table">
          <tbody>
            <tr>
              <td className="packet-label">Transport Name</td>
              <td>{transport.name}</td>
            </tr>
            <tr>
              <td className="packet-label">Run ID</td>
              <td className="packet-mono">{transport.id.slice(0, 8).toUpperCase()}</td>
            </tr>
            <tr>
              <td className="packet-label">Type</td>
              <td className="packet-capitalize">{transport.transportType}</td>
            </tr>
            <tr>
              <td className="packet-label">Origin</td>
              <td>{transport.originLocation || "N/A"}</td>
            </tr>
            <tr>
              <td className="packet-label">Destination</td>
              <td>{transport.destinationLocation || "N/A"}</td>
            </tr>
            <tr>
              <td className="packet-label">Departure</td>
              <td>{formatDateTime(transport.departureDate)}</td>
            </tr>
            <tr>
              <td className="packet-label">Est. Arrival</td>
              <td>{formatDateTime(transport.estimatedArrivalDate)}</td>
            </tr>
            <tr>
              <td className="packet-label">Vehicle</td>
              <td>{transport.vehicleInfo || "N/A"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="packet-section">
        <h3 className="packet-section-title">Driver Information</h3>
        {drivers.length > 0 ? (
          drivers.map((d) => (
            <div key={d.id} className="packet-contact-row">
              <span className="packet-contact-name">
                {d.externalName || "Assigned Driver"}
              </span>
              {d.externalPhone && (
                <span className="packet-contact-detail">{d.externalPhone}</span>
              )}
              {d.assignedLeg && (
                <span className="packet-contact-detail">{d.assignedLeg}</span>
              )}
            </div>
          ))
        ) : (
          <div className="packet-contact-row">
            <span className="packet-contact-name">{transport.driverName || "Not Assigned"}</span>
            {transport.driverPhone && (
              <span className="packet-contact-detail">{transport.driverPhone}</span>
            )}
          </div>
        )}
      </div>

      <div className="packet-section">
        <h3 className="packet-section-title">Emergency Contacts</h3>
        {organization.phone && (
          <div className="packet-contact-row">
            <span className="packet-contact-name">{organization.name}</span>
            <span className="packet-contact-detail">{organization.phone}</span>
            {organization.email && (
              <span className="packet-contact-detail">{organization.email}</span>
            )}
          </div>
        )}
        {emergencyContacts.slice(0, 4).map((c) => (
          <div key={c.id} className="packet-contact-row">
            <span className="packet-contact-name">
              {c.externalName || "Contact"} ({c.role})
            </span>
            {c.externalPhone && (
              <span className="packet-contact-detail">{c.externalPhone}</span>
            )}
            {c.externalEmail && (
              <span className="packet-contact-detail">{c.externalEmail}</span>
            )}
          </div>
        ))}
        {emergencyContacts.length === 0 && !organization.phone && (
          <p className="packet-muted">No emergency contacts listed.</p>
        )}
      </div>

      {stops.length > 0 && (
        <div className="packet-section">
          <h3 className="packet-section-title">Route Stops</h3>
          <table className="packet-table packet-table-bordered">
            <thead>
              <tr>
                <th>#</th>
                <th>Location</th>
                <th>Type</th>
                <th>ETA</th>
                <th>Contact</th>
              </tr>
            </thead>
            <tbody>
              {stops.map((stop, i) => (
                <tr key={stop.id}>
                  <td>{i + 1}</td>
                  <td>{stop.locationName || stop.address || "TBD"}</td>
                  <td className="packet-capitalize">{stop.stopType || "stop"}</td>
                  <td>{formatDateTime(stop.estimatedArrival)}</td>
                  <td>{stop.contactName || ""} {stop.contactPhone ? `(${stop.contactPhone})` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="packet-section">
        <h3 className="packet-section-title">
          Animal Manifest ({manifest.length} animal{manifest.length !== 1 ? "s" : ""})
        </h3>
        <table className="packet-table packet-table-bordered">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>ID</th>
              <th>Species / Breed</th>
              <th>Microchip</th>
              <th>Destination</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {manifest.map((item, i) => {
              const animal = item.animal;
              const chipNum =
                item.microchips?.[0]?.microchipNumber ||
                animal?.microchipNumber ||
                "None on file";
              const flags: string[] = [];
              if (item.needsMedication) flags.push("MEDS");
              if (item.isFlightRisk) flags.push("FLIGHT RISK");
              if (item.isAggressive) flags.push("AGGRESSIVE");
              return (
                <tr key={item.id}>
                  <td>{i + 1}</td>
                  <td className="packet-bold">{animal?.name || "Unknown"}</td>
                  <td className="packet-mono">{animal?.animalId || "—"}</td>
                  <td>
                    {animal?.species || "—"} / {animal?.breed || "—"}
                  </td>
                  <td className="packet-mono">{chipNum}</td>
                  <td>{item.destinationOrgName || "—"}</td>
                  <td>
                    {flags.length > 0 ? (
                      <span className="packet-flag">{flags.join(", ")}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {transport.notes && (
        <div className="packet-section">
          <h3 className="packet-section-title">Notes</h3>
          <p className="packet-notes">{transport.notes}</p>
        </div>
      )}
    </div>
  );
}

function AnimalSubPacket({
  item,
  index,
  total,
}: {
  item: ManifestItemWithMedical;
  index: number;
  total: number;
}) {
  const animal = item.animal;
  if (!animal) return null;

  const chipNum =
    item.microchips?.[0]?.microchipNumber ||
    animal.microchipNumber ||
    "None on file";

  const photoUrl = animal.photoUrls?.[0] || null;

  return (
    <>
      <div className="packet-page" data-testid={`packet-animal-${animal.animalId || index}`}>
        <div className="packet-animal-header">
          <div className="packet-animal-header-text">
            <h2 className="packet-animal-name">{animal.name}</h2>
            <span className="packet-animal-id">
              ID: {animal.animalId} — Animal {index + 1} of {total}
            </span>
          </div>
        </div>

        <div className="packet-animal-profile">
          {photoUrl && (
            <div className="packet-animal-photo-container">
              <img
                src={photoUrl}
                alt={animal.name}
                className="packet-animal-photo"
                crossOrigin="anonymous"
              />
            </div>
          )}
          <div className="packet-animal-demographics">
            <h3 className="packet-section-title">Profile</h3>
            <table className="packet-table">
              <tbody>
                <tr>
                  <td className="packet-label">Species</td>
                  <td>{animal.species}</td>
                </tr>
                <tr>
                  <td className="packet-label">Breed</td>
                  <td>{animal.breed}</td>
                </tr>
                <tr>
                  <td className="packet-label">Age</td>
                  <td>{animal.age || "Unknown"}</td>
                </tr>
                <tr>
                  <td className="packet-label">Sex</td>
                  <td className="packet-capitalize">{animal.sex || "Unknown"}</td>
                </tr>
                <tr>
                  <td className="packet-label">Weight</td>
                  <td>{animal.weight || "Not recorded"}</td>
                </tr>
                <tr>
                  <td className="packet-label">S/N Status</td>
                  <td>{getNeuterStatusLabel(animal.neuterStatus)}</td>
                </tr>
                <tr>
                  <td className="packet-label">Microchip</td>
                  <td className="packet-mono">{chipNum}</td>
                </tr>
                {item.microchips?.[0]?.manufacturer && (
                  <tr>
                    <td className="packet-label">Chip Mfg</td>
                    <td className="packet-capitalize">{item.microchips[0].manufacturer}</td>
                  </tr>
                )}
                <tr>
                  <td className="packet-label">Medical Alert</td>
                  <td>{animal.medicalAlertMemo || "None"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {(item.specialInstructions || item.medicationSchedule || item.feedingSchedule || item.behaviorNotes) && (
          <div className="packet-section">
            <h3 className="packet-section-title">Transport Instructions</h3>
            <table className="packet-table">
              <tbody>
                {item.specialInstructions && (
                  <tr>
                    <td className="packet-label">Special Instructions</td>
                    <td>{item.specialInstructions}</td>
                  </tr>
                )}
                {item.medicationSchedule && (
                  <tr>
                    <td className="packet-label">Medication Schedule</td>
                    <td>{item.medicationSchedule}</td>
                  </tr>
                )}
                {item.feedingSchedule && (
                  <tr>
                    <td className="packet-label">Feeding Schedule</td>
                    <td>{item.feedingSchedule}</td>
                  </tr>
                )}
                {item.behaviorNotes && (
                  <tr>
                    <td className="packet-label">Behavior Notes</td>
                    <td>{item.behaviorNotes}</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="packet-flags-row">
              {item.needsMedication && <span className="packet-flag-badge packet-flag-meds">NEEDS MEDICATION</span>}
              {item.isFlightRisk && <span className="packet-flag-badge packet-flag-flight">FLIGHT RISK</span>}
              {item.isAggressive && <span className="packet-flag-badge packet-flag-aggressive">AGGRESSIVE</span>}
            </div>
          </div>
        )}

        <div className="packet-section">
          <h3 className="packet-section-title">Vaccination History</h3>
          {item.vaccines.length > 0 ? (
            <table className="packet-table packet-table-bordered">
              <thead>
                <tr>
                  <th>Vaccine</th>
                  <th>Date Given</th>
                  <th>Date Due</th>
                  <th>Administered By</th>
                  <th>Lot #</th>
                </tr>
              </thead>
              <tbody>
                {item.vaccines.map((v) => (
                  <tr key={v.id}>
                    <td className="packet-bold">{v.itemName}</td>
                    <td>{formatDate(v.dateGiven)}</td>
                    <td>{formatDate(v.dateDue)}</td>
                    <td>{v.administeredBy || "—"}</td>
                    <td className="packet-mono">{v.lotNumber || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="packet-muted">No vaccine records on file.</p>
          )}
        </div>

        {item.exams.length > 0 && (
          <div className="packet-section">
            <h3 className="packet-section-title">Medical Exams</h3>
            <table className="packet-table packet-table-bordered">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Performed By</th>
                  <th>Assessment</th>
                </tr>
              </thead>
              <tbody>
                {item.exams.map((e) => (
                  <tr key={e.id}>
                    <td className="packet-capitalize">{e.examType}</td>
                    <td>{formatDate(e.examDate)}</td>
                    <td>{e.performedBy}</td>
                    <td>{e.assessment || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="packet-cvi-placeholder" data-testid="packet-cvi-placeholder">
          <div className="packet-cvi-inner">
            <p className="packet-cvi-text">ATTACH ORIGINAL CVI AND RABIES CERTIFICATE HERE</p>
            <p className="packet-cvi-subtext">
              Certificate of Veterinary Inspection — {animal.name} ({animal.animalId})
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export default function TransportDriverPacketPage() {
  const { transportId } = useParams<{ transportId: string }>();
  const hasPrinted = useRef(false);

  const { data, isLoading, error } = useQuery<DriverPacketData>({
    queryKey: ["/api/transport/events", transportId, "driver-packet"],
    queryFn: async () => {
      const res = await fetch(`/api/transport/events/${transportId}/driver-packet`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load driver packet");
      return res.json();
    },
    enabled: !!transportId,
  });

  useEffect(() => {
    if (data && !hasPrinted.current) {
      hasPrinted.current = true;
      const timer = setTimeout(() => {
        window.print();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [data]);

  if (isLoading) {
    return (
      <div className="packet-loading" data-testid="packet-loading">
        <Loader2 className="animate-spin" size={32} />
        <p>Loading driver packet...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="packet-loading" data-testid="packet-error">
        <p>Failed to load driver packet. Please go back and try again.</p>
      </div>
    );
  }

  return (
    <div className="packet-wrapper" data-testid="packet-wrapper">
      <div className="packet-toolbar no-print">
        <Button
          onClick={() => window.print()}
          data-testid="button-print-packet"
        >
          <Printer className="mr-2 h-4 w-4" />
          Print Packet
        </Button>
        <Button
          variant="outline"
          onClick={() => window.history.back()}
          data-testid="button-back"
        >
          Back to Transport
        </Button>
      </div>

      <MasterManifestPage data={data} />

      {data.manifest.map((item, i) => (
        <AnimalSubPacket
          key={item.id}
          item={item}
          index={i}
          total={data.manifest.length}
        />
      ))}

      <div className="packet-footer no-print">
        <p>
          Generated {new Date().toLocaleString()} — {data.organization.name}
        </p>
      </div>
    </div>
  );
}
