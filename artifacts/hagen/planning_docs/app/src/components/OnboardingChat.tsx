"use client";

import { useState, useRef, useEffect } from "react";
import {
  Paper,
  TextInput,
  Button,
  Text,
  Stack,
  Group,
  Avatar,
  ScrollArea,
  Loader,
  Badge,
  Transition,
} from "@mantine/core";
import { IconSend, IconBrandTiktok, IconBrandInstagram } from "@tabler/icons-react";
import { UserProfile } from "@/types";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  options?: string[];
  socialSync?: boolean;
}

interface OnboardingChatProps {
  onComplete: (profile: Partial<UserProfile>) => void;
}

type Stage = "welcome" | "business" | "social" | "goals" | "constraints" | "complete";

const stageMessages: Record<Stage, { message: string; options?: string[] }> = {
  welcome: {
    message: "Hi! I'm going to help find the perfect video concepts for your business. Tell me, what kind of business do you run?",
    options: ["Café / Coffee shop", "Restaurant", "Bar", "Salon / Barbershop", "Retail store", "Other"],
  },
  business: {
    message: "Got it! Want to connect your TikTok or Instagram? I can analyze your content to better understand your style.",
  },
  social: {
    message: "What are you hoping to achieve with short-form video content?",
    options: ["More foot traffic", "Brand awareness", "Engage existing customers", "Showcase products", "Just have fun with it"],
  },
  goals: {
    message: "Last question: any constraints I should know about? Budget, team size, that kind of thing.",
    options: ["Just me, solo filming", "Small team (2-3)", "Limited budget", "No constraints"],
  },
  constraints: {
    message: "",
  },
  complete: {
    message: "",
  },
};

export function OnboardingChat({ onComplete }: OnboardingChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [stage, setStage] = useState<Stage>("welcome");
  const [socialInput, setSocialInput] = useState("");
  const [showSocialSync, setShowSocialSync] = useState(false);
  const [profile, setProfile] = useState<Partial<UserProfile>>({
    goals: [],
    constraints: [],
    industryTags: [],
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initial message
  useEffect(() => {
    setTimeout(() => {
      addAssistantMessage(stageMessages.welcome.message, stageMessages.welcome.options);
    }, 500);
  }, []);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const addAssistantMessage = (content: string, options?: string[], socialSync?: boolean) => {
    setIsTyping(true);
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content,
          options,
          socialSync,
        },
      ]);
      setIsTyping(false);
      if (socialSync) {
        setShowSocialSync(true);
      }
    }, 800);
  };

  const addUserMessage = (content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: "user",
        content,
      },
    ]);
  };

  const handleOptionClick = (option: string) => {
    addUserMessage(option);
    processResponse(option);
  };

  const handleSend = () => {
    if (!input.trim()) return;
    addUserMessage(input);
    processResponse(input);
    setInput("");
  };

  const handleSocialSync = (platform: "tiktok" | "instagram") => {
    if (!socialInput.trim()) return;

    const handle = socialInput.startsWith("@") ? socialInput : `@${socialInput}`;
    addUserMessage(`Connected ${platform}: ${handle}`);

    setProfile((prev) => ({
      ...prev,
      socialLinks: {
        ...prev.socialLinks,
        [platform]: handle,
      },
    }));

    setShowSocialSync(false);
    setSocialInput("");

    // Move to goals
    setTimeout(() => {
      setStage("social");
      addAssistantMessage(
        `Great! I can see you're ${handle}. I'll use that to match your style. Now, ${stageMessages.social.message}`,
        stageMessages.social.options
      );
    }, 500);
  };

  const handleSkipSocial = () => {
    addUserMessage("Skip for now");
    setShowSocialSync(false);
    setStage("social");
    addAssistantMessage(stageMessages.social.message, stageMessages.social.options);
  };

  const processResponse = (response: string) => {
    const lowerResponse = response.toLowerCase();

    switch (stage) {
      case "welcome":
        // Extract business type
        let businessType = response;
        let tags: string[] = [];

        if (lowerResponse.includes("café") || lowerResponse.includes("coffee")) {
          tags = ["food", "beverage", "cafe", "local"];
          businessType = "Coffee shop";
        } else if (lowerResponse.includes("restaurant")) {
          tags = ["food", "restaurant", "local"];
        } else if (lowerResponse.includes("bar")) {
          tags = ["beverage", "bar", "nightlife", "local"];
        } else if (lowerResponse.includes("salon") || lowerResponse.includes("barber")) {
          tags = ["service", "salon", "beauty", "local"];
        } else if (lowerResponse.includes("retail")) {
          tags = ["retail", "local"];
        }

        setProfile((prev) => ({
          ...prev,
          businessDescription: businessType,
          industryTags: tags,
        }));

        setStage("business");
        addAssistantMessage(
          `A ${businessType.toLowerCase()} - nice! ${stageMessages.business.message}`,
          undefined,
          true
        );
        break;

      case "social":
        // Extract goals
        const goals = [response];
        setProfile((prev) => ({
          ...prev,
          goals: [...(prev.goals || []), response],
        }));

        setStage("goals");
        addAssistantMessage(stageMessages.goals.message, stageMessages.goals.options);
        break;

      case "goals":
        // Extract constraints
        setProfile((prev) => ({
          ...prev,
          constraints: [...(prev.constraints || []), response],
        }));

        setStage("complete");

        // Build summary
        const finalProfile = {
          ...profile,
          constraints: [...(profile.constraints || []), response],
          profileCompleteness: profile.socialLinks?.tiktok ? 75 : 55,
          onboardingComplete: true,
        };

        setTimeout(() => {
          addAssistantMessage(
            `Perfect! I've got a clear picture now:\n\n` +
            `• ${finalProfile.businessDescription}\n` +
            `• Goal: ${finalProfile.goals?.join(", ")}\n` +
            `• Constraint: ${finalProfile.constraints?.join(", ")}\n\n` +
            `I'll find concepts that work for your business. Let's see what matches!`
          );

          setTimeout(() => {
            onComplete(finalProfile);
          }, 2000);
        }, 500);
        break;
    }
  };

  return (
    <Paper shadow="sm" radius="lg" withBorder style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <Group p="md" style={{ borderBottom: "1px solid #eee" }}>
        <Avatar color="blue" radius="xl">L</Avatar>
        <div>
          <Text fw={500}>letrend</Text>
          <Text size="xs" c="dimmed">Your content assistant</Text>
        </div>
      </Group>

      {/* Messages */}
      <ScrollArea flex={1} p="md" viewportRef={scrollRef}>
        <Stack gap="md">
          {messages.map((msg) => (
            <div key={msg.id}>
              <Group align="flex-start" gap="sm" style={{ flexDirection: msg.role === "user" ? "row-reverse" : "row" }}>
                {msg.role === "assistant" && (
                  <Avatar color="blue" radius="xl" size="sm">L</Avatar>
                )}
                <Paper
                  p="sm"
                  radius="md"
                  bg={msg.role === "user" ? "blue.6" : "gray.1"}
                  c={msg.role === "user" ? "white" : undefined}
                  maw="80%"
                  style={{ whiteSpace: "pre-line" }}
                >
                  <Text size="sm">{msg.content}</Text>
                </Paper>
              </Group>

              {/* Options */}
              {msg.options && msg.role === "assistant" && (
                <Group gap="xs" mt="sm" ml={40}>
                  {msg.options.map((option) => (
                    <Badge
                      key={option}
                      variant="outline"
                      color="blue"
                      size="lg"
                      style={{ cursor: "pointer" }}
                      onClick={() => handleOptionClick(option)}
                    >
                      {option}
                    </Badge>
                  ))}
                </Group>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <Group align="flex-start" gap="sm">
              <Avatar color="blue" radius="xl" size="sm">L</Avatar>
              <Paper p="sm" radius="md" bg="gray.1">
                <Loader size="xs" type="dots" />
              </Paper>
            </Group>
          )}

          {/* Social sync UI */}
          <Transition mounted={showSocialSync} transition="slide-up" duration={300}>
            {(styles) => (
              <Paper style={styles} p="md" radius="md" withBorder ml={40}>
                <Stack gap="sm">
                  <Text size="sm" fw={500}>Connect your account</Text>
                  <TextInput
                    placeholder="@yourbusiness"
                    value={socialInput}
                    onChange={(e) => setSocialInput(e.target.value)}
                    leftSection={<IconBrandTiktok size={16} />}
                  />
                  <Group gap="xs">
                    <Button
                      size="xs"
                      leftSection={<IconBrandTiktok size={14} />}
                      onClick={() => handleSocialSync("tiktok")}
                      disabled={!socialInput.trim()}
                    >
                      Connect TikTok
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<IconBrandInstagram size={14} />}
                      onClick={() => handleSocialSync("instagram")}
                      disabled={!socialInput.trim()}
                    >
                      Connect Instagram
                    </Button>
                    <Button size="xs" variant="subtle" onClick={handleSkipSocial}>
                      Skip
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            )}
          </Transition>
        </Stack>
      </ScrollArea>

      {/* Input */}
      <Group p="md" style={{ borderTop: "1px solid #eee" }}>
        <TextInput
          placeholder="Type your answer..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          style={{ flex: 1 }}
          disabled={showSocialSync || stage === "complete"}
        />
        <Button onClick={handleSend} disabled={!input.trim() || showSocialSync || stage === "complete"}>
          <IconSend size={18} />
        </Button>
      </Group>
    </Paper>
  );
}
