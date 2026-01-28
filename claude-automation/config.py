"""
Configuration for Claude Desktop Automation

Edit this file to customize the behavior of the batch processor.
"""

# The system prompt/context that gets prepended to each note
# Empty = just send the note content (Claude Desktop has context already)
SYSTEM_PROMPT = ""

# Header that gets added before each response in the document
# Using unique marker since "## Email, Claude.ai:" already exists in the file
RESPONSE_HEADER = "### Claude Svar:"

# Maximum time to wait for Claude to respond (seconds)
RESPONSE_TIMEOUT = 180

# Claude window title (change if using different language)
CLAUDE_WINDOW_TITLE = "Claude"
