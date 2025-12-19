#!/usr/bin/env python3
"""
LinkedIn PDF Parser - Extracts all candidate data from LinkedIn PDFs
"""

import os
import sys
import re
import csv
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    print("Installing pdfplumber...")
    os.system("pip3 install pdfplumber --break-system-packages --quiet")
    import pdfplumber


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
        'experience_years': '',
        'vertical': ''
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
                return data

            # Find the name - skip "Contact" header
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
                # Clean credentials from name
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

            # Find headline (Title at Company | ...)
            for line in lines[:15]:
                if ' at ' in line and ('|' in line or len(line) > 20):
                    data['headline'] = line
                    parts = line.split(' at ')
                    data['title'] = parts[0].strip()
                    if len(parts) > 1:
                        company_part = parts[1].split('|')[0].strip()
                        data['company'] = company_part
                    break

            # Location
            for line in lines[:20]:
                # Common location patterns
                if re.match(r'^[A-Z][a-z]+,\s*[A-Z]', line) and 'Summary' not in line:
                    if any(loc in line for loc in ['Australia', 'Canada', 'USA', 'United States', 'UK', 'India', 'Area']):
                        data['location'] = line
                        break
                    elif ', ' in line and len(line) < 60:
                        data['location'] = line
                        break

            # Summary section
            summary_start = -1
            for i, line in enumerate(lines):
                if line.lower() == 'summary':
                    summary_start = i
                    break

            if summary_start > 0:
                summary_lines = []
                for j in range(summary_start + 1, min(summary_start + 10, len(lines))):
                    line = lines[j]
                    if line.lower() in ['experience', 'education', 'skills']:
                        break
                    summary_lines.append(line)
                data['summary'] = ' '.join(summary_lines)[:500]

            # Experience section - get all jobs
            exp_start = -1
            for i, line in enumerate(lines):
                if line.lower() == 'experience':
                    exp_start = i
                    break

            # Education section
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

            # Skills section
            skills_start = -1
            for i, line in enumerate(lines):
                if line.lower() in ['skills', 'top skills']:
                    skills_start = i
                    break

            if skills_start > 0:
                skills = []
                for j in range(skills_start + 1, min(skills_start + 15, len(lines))):
                    line = lines[j]
                    if line.lower() in ['experience', 'education', 'certifications', 'languages', 'summary']:
                        break
                    if len(line) > 2 and len(line) < 50:
                        skills.append(line)
                data['skills'] = ', '.join(skills[:10])

            # Certifications
            cert_start = -1
            for i, line in enumerate(lines):
                if 'certification' in line.lower():
                    cert_start = i
                    break

            if cert_start > 0:
                certs = []
                for j in range(cert_start + 1, min(cert_start + 10, len(lines))):
                    line = lines[j]
                    if line.lower() in ['skills', 'education', 'experience', 'languages']:
                        break
                    if len(line) > 3:
                        certs.append(line)
                data['certifications'] = ' | '.join(certs[:5])

    except Exception as e:
        print(f"Error parsing {pdf_path}: {e}")

    return data


def process_folder(folder_path, output_csv):
    """Process all PDFs in a folder"""
    folder = Path(folder_path)
    pdf_files = list(folder.glob('*.pdf')) + list(folder.glob('*.PDF'))

    if not pdf_files:
        print(f"No PDF files found in {folder_path}")
        return

    print(f"Found {len(pdf_files)} PDF files")

    results = []
    for pdf_file in pdf_files:
        print(f"Parsing: {pdf_file.name}")
        data = parse_linkedin_pdf(pdf_file)
        data['source_file'] = pdf_file.name
        results.append(data)

    fieldnames = ['first_name', 'last_name', 'full_name', 'linkedin_link', 'headline',
                  'title', 'company', 'location', 'summary', 'school', 'degree',
                  'skills', 'certifications', 'vertical', 'source_file']

    with open(output_csv, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in results:
            writer.writerow({k: r.get(k, '') for k in fieldnames})

    print(f"\nSaved {len(results)} records to {output_csv}")


def main():
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python parse_linkedin_pdf.py <pdf_file>")
        print("  python parse_linkedin_pdf.py <folder> <output.csv>")
        return

    input_path = sys.argv[1]

    if os.path.isfile(input_path):
        data = parse_linkedin_pdf(input_path)
        print("\n" + "="*50)
        print("EXTRACTED DATA")
        print("="*50)
        for key, value in data.items():
            if value:
                print(f"{key:20}: {value[:100]}{'...' if len(str(value)) > 100 else ''}")
    elif os.path.isdir(input_path):
        output_csv = sys.argv[2] if len(sys.argv) > 2 else 'linkedin_profiles.csv'
        process_folder(input_path, output_csv)
    else:
        print(f"Error: {input_path} not found")


if __name__ == "__main__":
    main()
