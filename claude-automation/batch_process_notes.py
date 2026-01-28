"""
Batch Process Notes through Claude Desktop

Reads a markdown file with multiple business notes, sends each through Claude,
and appends the response back to the same document.

Usage:
    python batch_process_notes.py notes.md
    python batch_process_notes.py notes.md --start-from 5
    python batch_process_notes.py notes.md --dry-run
"""

import re
import time
import argparse
import sys
import logging
from pathlib import Path
from datetime import datetime

import pyautogui
import pyperclip
import keyboard

# Import config
try:
    from config import (
        SYSTEM_PROMPT,
        RESPONSE_HEADER,
        RESPONSE_TIMEOUT,
        CLAUDE_WINDOW_TITLE
    )
except ImportError:
    SYSTEM_PROMPT = "Analysera följande:\n\n"
    RESPONSE_HEADER = "### Analys:"
    RESPONSE_TIMEOUT = 180
    CLAUDE_WINDOW_TITLE = "Claude"

# Safety settings
pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.1

# Setup logging
log_dir = Path(__file__).parent / "logs"
log_dir.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)


class ProgressTracker:
    """Track and display progress."""

    def __init__(self, total: int, file_path: Path):
        self.total = total
        self.completed = 0
        self.skipped = 0
        self.failed = 0
        self.current = None
        self.file_path = file_path
        self.start_time = datetime.now()

    def start_note(self, number: int, name: str):
        self.current = {'number': number, 'name': name, 'start': datetime.now()}
        logger.info(f"START #{number}: {name}")

    def complete_note(self, response_length: int = 0):
        self.completed += 1
        elapsed = (datetime.now() - self.current['start']).seconds
        logger.info(f"DONE  #{self.current['number']}: {self.current['name']} ({response_length} chars, {elapsed}s)")
        self._log_progress()

    def skip_note(self):
        self.skipped += 1
        logger.info(f"SKIP  #{self.current['number']}: {self.current['name']}")
        self._log_progress()

    def fail_note(self, reason: str):
        self.failed += 1
        logger.info(f"FAIL  #{self.current['number']}: {self.current['name']} - {reason}")
        self._log_progress()

    def _log_progress(self):
        processed = self.completed + self.skipped + self.failed
        remaining = self.total - processed
        elapsed = (datetime.now() - self.start_time).seconds

        if self.completed > 0:
            avg_time = elapsed / self.completed
            eta_seconds = int(remaining * avg_time)
            eta_min = eta_seconds // 60
            eta_str = f"~{eta_min}min" if eta_min > 0 else f"~{eta_seconds}s"
        else:
            eta_str = "unknown"

        logger.info(
            f"PROGRESS: {processed}/{self.total} "
            f"(done:{self.completed} skip:{self.skipped} fail:{self.failed}) "
            f"ETA: {eta_str}"
        )

    def summary(self):
        elapsed = (datetime.now() - self.start_time).seconds
        elapsed_min = elapsed // 60
        elapsed_sec = elapsed % 60

        logger.info("=" * 50)
        logger.info("SUMMARY")
        logger.info(f"  Total notes:  {self.total}")
        logger.info(f"  Completed:    {self.completed}")
        logger.info(f"  Skipped:      {self.skipped}")
        logger.info(f"  Failed:       {self.failed}")
        logger.info(f"  Time:         {elapsed_min}m {elapsed_sec}s")
        logger.info(f"  Output:       {self.file_path}")
        logger.info("=" * 50)


def find_claude_window():
    """Find and focus the Claude desktop window."""
    windows = pyautogui.getWindowsWithTitle(CLAUDE_WINDOW_TITLE)
    if not windows:
        logger.error(f"Window '{CLAUDE_WINDOW_TITLE}' not found")
        return None

    window = windows[0]
    try:
        window.activate()
        time.sleep(0.5)
        return window
    except Exception as e:
        logger.error(f"Could not activate window: {e}")
        return None


def parse_notes(content: str) -> list:
    """Parse markdown content into individual notes."""
    pattern = r'(## \d+\..+?)(?=## \d+\.|\Z)'
    matches = re.findall(pattern, content, re.DOTALL)

    notes = []
    for match in matches:
        match = match.strip()
        if match:
            header_match = re.match(r'## (\d+)\. (.+)', match.split('\n')[0])
            if header_match:
                # Check if already has response - look for "**Till:**" after "## Email, Claude.ai:"
                email_marker = "## Email, Claude.ai:"
                has_response = False
                if email_marker in match:
                    marker_pos = match.find(email_marker)
                    after_marker = match[marker_pos + len(email_marker):].strip()
                    # Look for email format indicators
                    has_response = "**Till:**" in after_marker or "**Ämne:**" in after_marker

                # Check if has real notes (not just empty template)
                has_real_notes = False
                notes_match = re.search(r'### Noter:\n(.+?)## Email', match, re.DOTALL)
                if notes_match:
                    notes_text = notes_match.group(1)
                    # Remove template bullets
                    clean = re.sub(r'- \*\*[^:]+:\*\*\s*', '', notes_text).strip()
                    has_real_notes = len(clean) > 100

                notes.append({
                    'number': int(header_match.group(1)),
                    'name': header_match.group(2).strip(),
                    'content': match,
                    'has_response': has_response,
                    'has_real_notes': has_real_notes,
                    'response': None
                })

    return notes


def send_to_claude(prompt: str) -> bool:
    """Send a prompt to Claude desktop."""
    pyperclip.copy(prompt)

    window = find_claude_window()
    if not window:
        return False

    time.sleep(0.3)

    # Click in the input area (bottom center of window)
    # Claude's input field is at the bottom of the window
    input_x = window.left + (window.width // 2)
    input_y = window.top + window.height - 100  # Near bottom

    pyautogui.click(input_x, input_y)
    time.sleep(0.3)

    # Paste and send
    pyautogui.hotkey('ctrl', 'v')
    time.sleep(0.5)
    pyautogui.press('enter')

    return True


def wait_for_response(auto_wait: int = 25) -> str:
    """Wait for Claude to finish and copy response automatically."""
    print(f"   ⏳ Waiting {auto_wait}s for response...")

    # Simple sleep - no keyboard polling that might interfere
    for i in range(auto_wait, 0, -1):
        print(f"\r   ⏳ {i}s ", end='', flush=True)
        time.sleep(1)

    print("   ✓ Copying response...")
    return copy_response()


def copy_response() -> str:
    """Copy the last response from Claude by finding and clicking the copy button."""
    window = find_claude_window()
    if not window:
        return None

    time.sleep(0.5)

    # First, scroll down to make sure we see the latest response
    # Click in the chat area first
    chat_x = window.left + (window.width // 2)
    chat_y = window.top + (window.height // 2)
    pyautogui.click(chat_x, chat_y)
    time.sleep(0.2)

    # Scroll all the way down to bottom of chat (aggressive scrolling)
    for _ in range(100):
        pyautogui.scroll(-20)  # Negative = scroll down
    time.sleep(0.5)

    # Move mouse to chat area to trigger hover on response
    pyautogui.moveTo(chat_x, chat_y - 100)
    time.sleep(0.5)

    # Try to find the copy icon using image recognition
    icon_path = Path(__file__).parent / "copy_icon.png"
    if icon_path.exists():
        try:
            # Look for the copy button icon
            location = pyautogui.locateOnScreen(str(icon_path), confidence=0.7)
            if location:
                # Click the center of the found icon
                center = pyautogui.center(location)
                pyautogui.click(center)
                time.sleep(0.3)

                response = pyperclip.paste()
                if response:
                    print(f"   ✅ Copied ({len(response)} chars)")
                    return response
            else:
                print("   ⚠️ Copy icon not found on screen")
        except Exception as e:
            print(f"   ⚠️ Image search error: {e}")

    return None


def update_document(file_path: Path, notes: list) -> None:
    """Update the original document with responses."""
    content = file_path.read_text(encoding='utf-8')

    for note in notes:
        if note['response'] and note['response'] not in ['[SKIPPED]', '[TIMEOUT]']:
            # Find "## Email, Claude.ai:" and add response after it
            email_marker = "## Email, Claude.ai:"
            if email_marker in note['content']:
                # Check if already has response (more than just the marker)
                marker_pos = note['content'].find(email_marker)
                after_marker = note['content'][marker_pos + len(email_marker):].strip()

                # Only add if no substantial content after marker
                if len(after_marker) < 50:
                    old_section = note['content']
                    # Replace the marker with marker + response
                    new_section = note['content'].replace(
                        email_marker,
                        f"{email_marker}\n\n{note['response']}"
                    )
                    content = content.replace(old_section, new_section)
                    note['content'] = new_section

    # Backup original (only once)
    backup_path = file_path.with_suffix('.backup.md')
    if not backup_path.exists():
        original_content = file_path.read_text(encoding='utf-8')
        backup_path.write_text(original_content, encoding='utf-8')
        logger.info(f"Backup saved: {backup_path}")

    file_path.write_text(content, encoding='utf-8')


def process_notes(file_path: Path, start_from: int = 1, dry_run: bool = False):
    """Main processing function."""
    logger.info("=" * 50)
    logger.info("CLAUDE BATCH PROCESSOR")
    logger.info("=" * 50)

    content = file_path.read_text(encoding='utf-8')
    notes = parse_notes(content)

    if not notes:
        logger.error("No notes found in file")
        return

    # Filter out already processed notes and notes without real content
    pending_notes = [n for n in notes if not n['has_response'] and n.get('has_real_notes', True) and n['number'] >= start_from]
    already_done = len([n for n in notes if n['has_response']])
    no_notes = len([n for n in notes if not n.get('has_real_notes', True)])

    logger.info(f"File: {file_path}")
    logger.info(f"Total notes: {len(notes)}")
    logger.info(f"Already done: {already_done}")
    logger.info(f"Skipping (no notes): {no_notes}")
    logger.info(f"To process: {len(pending_notes)}")
    logger.info(f"Starting from: #{start_from}")

    if dry_run:
        logger.info("DRY RUN - showing notes to process:")
        for note in pending_notes:
            logger.info(f"  #{note['number']}: {note['name']}")
        return

    if not pending_notes:
        logger.info("Nothing to process!")
        return

    # Check Claude window
    if not find_claude_window():
        logger.error("Open Claude desktop first!")
        return

    tracker = ProgressTracker(len(pending_notes), file_path)

    print("\n" + "-" * 50)
    print("AUTOMATIC MODE: 20s wait per response | 'q'=quit | mouse-corner=abort")
    print("-" * 50)
    print("\nStarting in 3 seconds...")
    time.sleep(3)

    for note in pending_notes:
        print(f"\n{'='*50}")
        print(f"📝 #{note['number']}: {note['name']}")
        print('='*50)

        tracker.start_note(note['number'], note['name'])

        prompt = SYSTEM_PROMPT + note['content']

        print("   📤 Sending to Claude...")

        if send_to_claude(prompt):
            response = wait_for_response()

            if response is None:  # User pressed 'q'
                logger.info("ABORTED by user")
                break

            if response == "[SKIPPED]":
                tracker.skip_note()
            elif response == "[TIMEOUT]":
                tracker.fail_note("timeout")
            else:
                note['response'] = response
                tracker.complete_note(len(response))
                update_document(file_path, notes)
        else:
            tracker.fail_note("could not send")

        time.sleep(0.5)

    tracker.summary()


def main():
    parser = argparse.ArgumentParser(description="Batch process notes through Claude Desktop")
    parser.add_argument('file', type=str, help="Markdown file with notes")
    parser.add_argument('--start-from', '-s', type=int, default=1, help="Start from note #X")
    parser.add_argument('--dry-run', '-d', action='store_true', help="Show what would be done")

    args = parser.parse_args()

    file_path = Path(args.file)
    if not file_path.exists():
        logger.error(f"File not found: {file_path}")
        sys.exit(1)

    process_notes(file_path, args.start_from, args.dry_run)


if __name__ == "__main__":
    main()
