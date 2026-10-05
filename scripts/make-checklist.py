"""Generates server/assets/Cloud-Security-Checklist.pdf (run: python scripts/make-checklist.py). Requires reportlab."""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Frame
from reportlab.lib.styles import ParagraphStyle

OUT = os.path.join(os.path.dirname(__file__), "..", "server", "assets", "Cloud-Security-Checklist.pdf")
os.makedirs(os.path.dirname(OUT), exist_ok=True)

INK = colors.HexColor("#131010")
GREEN = colors.HexColor("#2f9e57")
LIGHT = colors.HexColor("#eef7f0")
MUTED = colors.HexColor("#5a5555")
W, H = A4
M = 18 * mm

SECTIONS = [
    ("1. Identity and access", [
        "Multi-factor authentication is required for every user and every admin account",
        "Shared and generic accounts are removed; each person has their own login",
        "Access follows least privilege and is reviewed at least quarterly",
        "Leavers are deprovisioned the same day; unused accounts are disabled",
        "Admin roles are separate from daily-use accounts and are used only when needed",
        "Service accounts and API keys are inventoried, scoped and rotated",
    ]),
    ("2. Data protection", [
        "You know where sensitive data lives and who can reach it (a simple data map)",
        "Data is encrypted at rest and in transit",
        "Storage buckets, databases and snapshots are not publicly exposed",
        "Encryption keys and secrets live in a managed vault, not in code or chat",
        "Retention rules exist so old data is deleted when no longer needed",
    ]),
    ("3. Logging and monitoring", [
        "Audit logging is on for logins, configuration changes and data access",
        "Logs are sent to a separate location that attackers cannot easily erase",
        "Alerts exist for impossible-travel logins, privilege changes and mass downloads",
        "Someone owns alert triage and knows what to do at 2 a.m.",
        "Monitoring covers cloud, endpoints and network, not just one of them",
    ]),
    ("4. Configuration and network", [
        "A baseline for secure configuration exists and drift is detected",
        "Public endpoints are inventoried; unused ports and services are closed",
        "Systems and dependencies are patched on a defined schedule",
        "Network segmentation limits how far an intruder can move",
        "Infrastructure is defined as code and changes are reviewed",
    ]),
    ("5. Backup and resilience", [
        "Backups are encrypted and kept separate from production credentials",
        "Restores are tested on a schedule, not just backups taken",
        "Recovery time and recovery point targets are written down",
        "A copy of critical backups cannot be altered or deleted by a compromised admin",
    ]),
    ("6. Incident response", [
        "A short incident plan names who decides, who acts and who communicates",
        "Contact details for key people, vendors and advisors are available offline",
        "The plan is rehearsed at least once a year with a realistic scenario",
        "Lessons from every incident or near miss feed back into controls",
    ]),
    ("7. Compliance and governance", [
        "You know which standards, regulations and customer requirements apply",
        "Each control has an owner and a source of evidence",
        "Evidence is collected continuously so audits are routine, not a scramble",
        "Policies are short, current and easy to find; staff receive security awareness training",
        "Third-party and supplier risks are reviewed before and during the relationship",
    ]),
]

PLAN = [
    ("Days 1 to 7", "Turn on MFA everywhere. Remove shared accounts. List public endpoints and storage."),
    ("Days 8 to 14", "Switch on audit logging and route it to a protected location. Define who triages alerts."),
    ("Days 15 to 21", "Review access and offboard stale accounts. Test one backup restore."),
    ("Days 22 to 30", "Write the one-page incident plan and run a 30-minute tabletop. Start an evidence tracker."),
]

c = canvas.Canvas(OUT, pagesize=A4)
c.setTitle("Cloud Security Checklist")
c.setAuthor("DuRuVaSa CloudSec")
c.setSubject("A practical checklist for securing your cloud")

page = [1]
def footer():
    c.setFillColor(MUTED); c.setFont("Helvetica", 8)
    c.drawString(M, 10 * mm, "DuRuVaSa CloudSec  |  www.duruvasa.com  |  info@duruvasa.com")
    c.drawRightString(W - M, 10 * mm, f"Page {page[0]}")
    c.setStrokeColor(colors.HexColor("#d9d4d0")); c.line(M, 14 * mm, W - M, 14 * mm)

def new_page():
    footer(); c.showPage(); page[0] += 1

# ---- cover band ----
c.setFillColor(INK); c.rect(0, H - 62 * mm, W, 62 * mm, stroke=0, fill=1)
c.setFillColor(GREEN); c.rect(0, H - 62 * mm, W, 2.2 * mm, stroke=0, fill=1)
c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 26)
c.drawString(M, H - 28 * mm, "Cloud Security Checklist")
c.setFont("Helvetica", 12); c.setFillColor(colors.HexColor("#cfe9d6"))
c.drawString(M, H - 38 * mm, "Seven areas to check, plus a 30-day quick-win plan")
c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 10)
c.drawString(M, H - 52 * mm, "DuRuVaSa CloudSec")
c.setFont("Helvetica", 10); c.drawString(M + 36 * mm, H - 52 * mm, "Cybersecurity consulting: threat detection, compliance, 24/7 monitoring")

body = ParagraphStyle("b", fontName="Helvetica", fontSize=10, leading=14, textColor=INK)
intro = Paragraph(
    "Use this checklist to get a quick, honest picture of your cloud security. Tick what is fully in place today. "
    "Anything unticked is a conversation worth having. Aim to close the gaps in the first sections first: identity and "
    "monitoring prevent and reveal most real-world incidents.", body)
f = Frame(M, H - 100 * mm, W - 2 * M, 34 * mm, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0, showBoundary=0)
f.addFromList([intro], c)

y = H - 108 * mm
head = ParagraphStyle("h", fontName="Helvetica-Bold", fontSize=13, textColor=INK)
item = ParagraphStyle("i", fontName="Helvetica", fontSize=10, leading=13, textColor=INK)

def draw_section(title, items, y):
    need = 16 * mm + len(items) * 9.5 * mm
    if y - need < 22 * mm:
        new_page(); y = H - 22 * mm
    c.setFillColor(LIGHT); c.roundRect(M, y - 8 * mm, W - 2 * M, 8 * mm, 2 * mm, stroke=0, fill=1)
    c.setFillColor(GREEN); c.rect(M, y - 8 * mm, 1.6 * mm, 8 * mm, stroke=0, fill=1)
    c.setFillColor(INK); c.setFont("Helvetica-Bold", 12); c.drawString(M + 5 * mm, y - 5.6 * mm, title)
    y -= 13 * mm
    for t in items:
        c.setStrokeColor(GREEN); c.setLineWidth(1.2); c.setFillColor(colors.white)
        c.roundRect(M + 1 * mm, y - 2.7 * mm, 4.2 * mm, 4.2 * mm, 0.8 * mm, stroke=1, fill=1)
        p = Paragraph(t, item)
        w, h = p.wrap(W - 2 * M - 10 * mm, 30 * mm)
        p.drawOn(c, M + 9 * mm, y - h + 3.2 * mm)
        y -= max(h, 11) + 3.2 * mm
    return y - 4 * mm

for title, items in SECTIONS:
    y = draw_section(title, items, y)

# ---- 30-day plan ----
if y - 80 * mm < 22 * mm:
    new_page(); y = H - 22 * mm
c.setFillColor(INK); c.roundRect(M, y - 8 * mm, W - 2 * M, 8 * mm, 2 * mm, stroke=0, fill=1)
c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 12); c.drawString(M + 5 * mm, y - 5.6 * mm, "Your 30-day quick-win plan")
y -= 15 * mm
for when, what in PLAN:
    c.setFillColor(GREEN); c.setFont("Helvetica-Bold", 10.5); c.drawString(M + 1 * mm, y, when)
    p = Paragraph(what, item); w, h = p.wrap(W - 2 * M - 38 * mm, 30 * mm); p.drawOn(c, M + 36 * mm, y - h + 3.5 * mm)
    y -= max(h, 10) + 5 * mm

y -= 4 * mm
c.setFillColor(LIGHT); c.roundRect(M, y - 26 * mm, W - 2 * M, 26 * mm, 3 * mm, stroke=0, fill=1)
c.setFillColor(INK); c.setFont("Helvetica-Bold", 11); c.drawString(M + 6 * mm, y - 8 * mm, "Want help closing the gaps?")
c.setFont("Helvetica", 10)
c.drawString(M + 6 * mm, y - 15 * mm, "Book a consultation or take the 2-minute security self-check on our website.")
c.setFillColor(GREEN); c.setFont("Helvetica-Bold", 10)
c.drawString(M + 6 * mm, y - 21.5 * mm, "www.duruvasa.com   |   info@duruvasa.com")

c.setFillColor(MUTED); c.setFont("Helvetica-Oblique", 7.5)
c.drawString(M, y - 33 * mm, "This checklist is general guidance and not a substitute for a professional security assessment.")

footer(); c.save()
print("wrote", os.path.abspath(OUT), "pages:", page[0])
