"use client";

import { useState } from "react";
import {
  Paper,
  TextInput,
  ActionIcon,
  Text,
  Stack,
  Group,
  Badge,
  ScrollArea,
  Collapse,
  UnstyledButton,
} from "@mantine/core";
import { IconSend, IconMessageCircle, IconX } from "@tabler/icons-react";
import { ChatMessage } from "@/types";

interface MiniChatProps {
  onSendMessage?: (message: string) => void;
}

const quickActions = [
  "Show me easier stuff",
  "More trending content",
  "Solo filming only",
  "Under $25",
];

export function MiniChat({ onSendMessage }: MiniChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      role: "assistant",
      content: "Need to refine your results? Just ask!",
      timestamp: new Date(),
    },
  ]);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    onSendMessage?.(input);
    setInput("");

    // Mock response
    setTimeout(() => {
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Got it! Filtering for "${input}"...`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    }, 500);
  };

  const handleQuickAction = (action: string) => {
    setInput(action);
    setIsOpen(true);
  };

  return (
    <Paper
      shadow="md"
      radius="md"
      withBorder
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        width: isOpen ? 350 : "auto",
        zIndex: 1000,
      }}
    >
      {/* Collapsed state - just a button */}
      {!isOpen && (
        <UnstyledButton
          onClick={() => setIsOpen(true)}
          p="md"
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <IconMessageCircle size={20} />
          <Text size="sm" fw={500}>
            Refine results
          </Text>
        </UnstyledButton>
      )}

      {/* Expanded state */}
      <Collapse in={isOpen}>
        <Stack gap={0}>
          {/* Header */}
          <Group justify="space-between" p="sm" style={{ borderBottom: "1px solid #eee" }}>
            <Text size="sm" fw={500}>
              Quick refinement
            </Text>
            <ActionIcon variant="subtle" size="sm" onClick={() => setIsOpen(false)}>
              <IconX size={16} />
            </ActionIcon>
          </Group>

          {/* Messages */}
          <ScrollArea h={150} p="sm">
            <Stack gap="xs">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <Paper
                    p="xs"
                    radius="md"
                    bg={msg.role === "user" ? "blue.1" : "gray.1"}
                    maw="80%"
                  >
                    <Text size="sm">{msg.content}</Text>
                  </Paper>
                </div>
              ))}
            </Stack>
          </ScrollArea>

          {/* Quick actions */}
          <Group gap="xs" p="xs" style={{ borderTop: "1px solid #eee" }}>
            {quickActions.map((action) => (
              <Badge
                key={action}
                variant="outline"
                size="sm"
                style={{ cursor: "pointer" }}
                onClick={() => handleQuickAction(action)}
              >
                {action}
              </Badge>
            ))}
          </Group>

          {/* Input */}
          <Group gap="xs" p="sm" style={{ borderTop: "1px solid #eee" }}>
            <TextInput
              placeholder="Type to refine..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              style={{ flex: 1 }}
              size="sm"
            />
            <ActionIcon
              variant="filled"
              color="blue"
              onClick={handleSend}
              disabled={!input.trim()}
            >
              <IconSend size={16} />
            </ActionIcon>
          </Group>
        </Stack>
      </Collapse>
    </Paper>
  );
}
