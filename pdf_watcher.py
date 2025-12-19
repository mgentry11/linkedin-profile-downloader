#!/usr/bin/env python3
"""
LinkedIn PDF Watcher
Monitors Downloads folder for new LinkedIn PDFs and auto-parses to spreadsheet
"""

import os
import sys
import time
import csv
from pathlib import Path
from datetime import datetime

try:
    import pdfplumber
except ImportError:
    os.system("pip3 install pdfplumber --break-system-packages --quiet")
    import pdfplumber

try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
except ImportError:
    os.system("pip3 install watchdog --break-system-packages --quiet")
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler

import re

# Configuration
WATCH_FOLDER = os.path.expanduser("~/Downloads")
OUTPUT_FILE = os.path.expanduser("~/Downloads/linkedin_candidates.csv")
PROCESSED_FILE = os.path.expanduser("~/Downloads/.linkedin_processed.txt")


def parse_linkedin_pdf(pdf_path):
    """Parse a LinkedIn PDF and extract candidate info"""
    data = {
        'first_name': '',
        'last_name': '',
        'full_name': '',
        'linkedin_link': '',
        'headline': '',
        'title': '',
        'company': '',
        'location': '',
        'summary': '',
        'school': '',
        'degree': '',
        'skills': '',
        'certifications': '',
        'vertical': '',
        'source_file': os.path.basename(pdf_path),
        'parsed_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }

    try:
        with pdfplumber.open(pdf_path) as pdf:
            full_text = ""
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    full_text += text + "\n"

            lines = [l.strip() for l in full_text.split('\n') if l.strip()]

            if not lines:
                return None

            # Check if this looks like a LinkedIn PDF
            if not any('linkedin' in line.lower() for line in lines[:10]):
                return None

            # Find the name
            name_line = ''
            for line in lines[:5]:
                if line.lower().startswith('contact'):
                    remaining = line[7:].strip()
                    if remaining:
                        name_line = remaining
                        break
                elif line.startswith('www.') or line.startswith('http') or line.startswith('(LinkedIn)'):
                    continue
                elif len(line) > 2:
                    name_line = line
                    break

            if name_line:
                name_clean = re.split(r'\s+(?:MBA|CSC|LLQP|CPA|CFA|PhD|MD|JD|PMP|CFP|,)\s*', name_line)[0].strip()
                name_clean = name_clean.rstrip(',').strip()
                data['full_name'] = name_clean

                name_parts = name_clean.split()
                if len(name_parts) >= 2:
                    data['first_name'] = name_parts[0]
                    data['last_name'] = ' '.join(name_parts[1:])
                elif len(name_parts) == 1:
                    data['first_name'] = name_parts[0]

            # LinkedIn URL
            match = re.search(r'linkedin\.com/in/([a-zA-Z0-9\-]+)', full_text)
            if match:
                data['linkedin_link'] = f"https://www.linkedin.com/in/{match.group(1)}"

            # Headline
            for line in lines[:15]:
                if ' at ' in line and ('|' in line or len(line) > 20):
                    data['headline'] = line[:200]
                    parts = line.split(' at ')
                    data['title'] = parts[0].strip()
                    if len(parts) > 1:
                        data['company'] = parts[1].split('|')[0].strip()
                    break

            # Location
            for line in lines[:20]:
                if re.match(r'^[A-Z][a-z]+,\s*[A-Z]', line) and 'Summary' not in line:
                    if any(loc in line for loc in ['Australia', 'Canada', 'USA', 'United States', 'UK', 'India', 'Area']):
                        data['location'] = line
                        break
                    elif ', ' in line and len(line) < 60:
                        data['location'] = line
                        break

            # Education
            edu_start = -1
            for i, line in enumerate(lines):
                if line.lower() == 'education':
                    edu_start = i
                    break

            if edu_start > 0:
                schools = []
                degrees = []
                for j in range(edu_start + 1, min(edu_start + 20, len(lines))):
                    line = lines[j]
                    if line.lower() in ['skills', 'licenses', 'certifications', 'languages']:
                        break
                    if any(x in line for x in ['University', 'College', 'Institute', 'School', 'Academy']):
                        schools.append(line)
                    elif any(x in line for x in ['Bachelor', 'Master', 'MBA', 'PhD', 'Degree', 'B.S.', 'B.A.', 'M.S.', 'Postgraduate', 'BBA', 'Diploma']):
                        degrees.append(line.split('·')[0].strip())

                data['school'] = ' | '.join(schools[:3])
                data['degree'] = ' | '.join(degrees[:3])

    except Exception as e:
        print(f"  Error parsing: {e}")
        return None

    return data


def get_processed_files():
    """Get list of already processed files"""
    if os.path.exists(PROCESSED_FILE):
        with open(PROCESSED_FILE, 'r') as f:
            return set(f.read().splitlines())
    return set()


def mark_as_processed(filename):
    """Mark a file as processed"""
    with open(PROCESSED_FILE, 'a') as f:
        f.write(filename + '\n')


def append_to_csv(data):
    """Append parsed data to CSV file"""
    fieldnames = ['first_name', 'last_name', 'full_name', 'linkedin_link', 'headline',
                  'title', 'company', 'location', 'summary', 'school', 'degree',
                  'skills', 'certifications', 'vertical', 'source_file', 'parsed_at']

    file_exists = os.path.exists(OUTPUT_FILE)

    with open(OUTPUT_FILE, 'a', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if not file_exists:
            writer.writeheader()
        writer.writerow({k: data.get(k, '') for k in fieldnames})


def process_pdf(pdf_path):
    """Process a single PDF file"""
    filename = os.path.basename(pdf_path)
    processed = get_processed_files()

    if filename in processed:
        return False

    print(f"\n{'='*50}")
    print(f"NEW PDF DETECTED: {filename}")
    print(f"{'='*50}")

    # Wait a moment for file to finish writing
    time.sleep(1)

    data = parse_linkedin_pdf(pdf_path)

    if data and data['first_name']:
        append_to_csv(data)
        mark_as_processed(filename)
        print(f"✓ Parsed: {data['first_name']} {data['last_name']}")
        print(f"  Title: {data['title']}")
        print(f"  Company: {data['company']}")
        print(f"  Location: {data['location']}")
        print(f"  → Added to: {OUTPUT_FILE}")
        return True
    else:
        print(f"✗ Not a LinkedIn profile PDF or parsing failed")
        return False


class PDFHandler(FileSystemEventHandler):
    """Handle new PDF files"""

    def on_created(self, event):
        if event.is_directory:
            return
        if event.src_path.lower().endswith('.pdf'):
            # Wait for file to be fully written
            time.sleep(2)
            process_pdf(event.src_path)

    def on_modified(self, event):
        if event.is_directory:
            return
        if event.src_path.lower().endswith('.pdf'):
            filename = os.path.basename(event.src_path)
            if filename.startswith('Profile') or 'linkedin' in filename.lower():
                processed = get_processed_files()
                if filename not in processed:
                    time.sleep(2)
                    process_pdf(event.src_path)


def main():
    print("="*60)
    print("  LINKEDIN PDF WATCHER")
    print("="*60)
    print(f"\n  Watching: {WATCH_FOLDER}")
    print(f"  Output:   {OUTPUT_FILE}")
    print(f"\n  Download LinkedIn PDFs and they'll auto-parse!")
    print(f"  Press Ctrl+C to stop\n")
    print("="*60)

    # Process any existing unprocessed PDFs
    print("\nChecking for existing PDFs...")
    processed = get_processed_files()
    for pdf in Path(WATCH_FOLDER).glob("Profile*.pdf"):
        if pdf.name not in processed:
            process_pdf(str(pdf))

    # Start watching
    event_handler = PDFHandler()
    observer = Observer()
    observer.schedule(event_handler, WATCH_FOLDER, recursive=False)
    observer.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        print("\n\nStopped watching.")
        print(f"Data saved to: {OUTPUT_FILE}")

    observer.join()


if __name__ == "__main__":
    main()
