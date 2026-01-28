"""
Claude Desktop Automation
Automates interaction with Claude AI desktop app for efficient context-based usage.

Usage:
    python claude_desktop_automation.py --prompt "Your prompt here"
    python claude_desktop_automation.py --file prompt.txt
    python claude_desktop_automation.py --interactive
"""

import pyautogui
import pyperclip
import time
import argparse
import sys

# Safety settings
pyautogui.FAILSAFE = True  # Move mouse to corner to abort
pyautogui.PAUSE = 0.1

# Configuration
CLAUDE_WINDOW_TITLE = "Claude"
WAIT_AFTER_SEND = 2  # Initial wait before checking for response
RESPONSE_TIMEOUT = 120  # Max seconds to wait for response


def find_claude_window():
    """Find and focus the Claude desktop window."""
    windows = pyautogui.getWindowsWithTitle(CLAUDE_WINDOW_TITLE)
    if not windows:
        print(f"Error: Could not find window with title '{CLAUDE_WINDOW_TITLE}'")
        print("Make sure Claude desktop app is open.")
        return None

    window = windows[0]
    try:
        window.activate()
        time.sleep(0.5)
        return window
    except Exception as e:
        print(f"Error activating window: {e}")
        return None


def send_prompt(prompt: str) -> bool:
    """Send a prompt to Claude."""
    # Copy prompt to clipboard
    pyperclip.copy(prompt)

    # Find and focus Claude window
    window = find_claude_window()
    if not window:
        return False

    # Paste the prompt (Ctrl+V)
    pyautogui.hotkey('ctrl', 'v')
    time.sleep(0.3)

    # Send the message (Enter)
    pyautogui.press('enter')

    print("Prompt sent. Waiting for response...")
    return True


def wait_for_response(timeout: int = RESPONSE_TIMEOUT) -> str:
    """
    Wait for Claude to finish generating and copy the response.

    This uses a simple approach: wait for user to press a key when done.
    More sophisticated detection could monitor the UI for the stop button.
    """
    print(f"\n⏳ Waiting for response (max {timeout}s)...")
    print("Press 'c' when Claude has finished generating to copy response.")
    print("Press 'q' to quit without copying.\n")

    import keyboard

    start_time = time.time()
    while time.time() - start_time < timeout:
        if keyboard.is_pressed('c'):
            time.sleep(0.3)  # Debounce
            return copy_response()
        if keyboard.is_pressed('q'):
            print("Cancelled by user.")
            return None
        time.sleep(0.1)

    print("Timeout reached.")
    return None


def copy_response() -> str:
    """Copy the last response from Claude."""
    window = find_claude_window()
    if not window:
        return None

    # Strategy: Use keyboard shortcut to copy last response
    # Claude desktop app supports Ctrl+Shift+C to copy last response
    # If that doesn't work, we'll try selecting and copying

    time.sleep(0.2)

    # Try the copy last response shortcut
    pyautogui.hotkey('ctrl', 'shift', 'c')
    time.sleep(0.3)

    response = pyperclip.paste()

    if response:
        print(f"\n✅ Response copied ({len(response)} chars)")
        return response
    else:
        print("Could not copy response. Try selecting it manually.")
        return None


def run_interactive():
    """Run in interactive mode - continuous prompt/response loop."""
    print("=" * 50)
    print("Claude Desktop Automation - Interactive Mode")
    print("=" * 50)
    print("\nCommands:")
    print("  Type your prompt and press Enter twice to send")
    print("  Type 'quit' or 'exit' to stop")
    print("  Type 'copy' to copy last response")
    print()

    while True:
        print("\n" + "-" * 30)
        prompt_lines = []
        print("Enter prompt (empty line to send, 'quit' to exit):")

        while True:
            line = input()
            if line.lower() in ['quit', 'exit']:
                print("Goodbye!")
                return
            if line == '':
                if prompt_lines:
                    break
                continue
            if line.lower() == 'copy':
                copy_response()
                continue
            prompt_lines.append(line)

        prompt = '\n'.join(prompt_lines)
        if send_prompt(prompt):
            response = wait_for_response()
            if response:
                print("\n" + "=" * 50)
                print("RESPONSE:")
                print("=" * 50)
                print(response[:500] + "..." if len(response) > 500 else response)


def run_single(prompt: str, auto_copy: bool = True):
    """Run a single prompt and optionally wait for response."""
    print(f"Sending prompt ({len(prompt)} chars)...")

    if send_prompt(prompt):
        if auto_copy:
            response = wait_for_response()
            return response
    return None


def main():
    parser = argparse.ArgumentParser(
        description="Automate Claude Desktop app interactions"
    )
    parser.add_argument(
        '--prompt', '-p',
        type=str,
        help="The prompt to send to Claude"
    )
    parser.add_argument(
        '--file', '-f',
        type=str,
        help="Read prompt from a file"
    )
    parser.add_argument(
        '--interactive', '-i',
        action='store_true',
        help="Run in interactive mode"
    )
    parser.add_argument(
        '--output', '-o',
        type=str,
        help="Save response to file"
    )
    parser.add_argument(
        '--no-wait',
        action='store_true',
        help="Don't wait for response, just send the prompt"
    )

    args = parser.parse_args()

    # Interactive mode
    if args.interactive:
        run_interactive()
        return

    # Get prompt from argument or file
    prompt = None
    if args.prompt:
        prompt = args.prompt
    elif args.file:
        try:
            with open(args.file, 'r', encoding='utf-8') as f:
                prompt = f.read()
        except Exception as e:
            print(f"Error reading file: {e}")
            sys.exit(1)
    else:
        parser.print_help()
        sys.exit(1)

    # Run single prompt
    response = run_single(prompt, auto_copy=not args.no_wait)

    # Save output if requested
    if response and args.output:
        try:
            with open(args.output, 'w', encoding='utf-8') as f:
                f.write(response)
            print(f"Response saved to {args.output}")
        except Exception as e:
            print(f"Error saving output: {e}")


if __name__ == "__main__":
    main()
