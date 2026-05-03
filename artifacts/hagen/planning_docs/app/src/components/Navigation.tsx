"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  Group,
  Button,
  Text,
  Container,
  ActionIcon,
  Menu,
  Avatar,
  Divider,
  Box,
} from "@mantine/core";
import {
  IconLayoutDashboard,
  IconFolder,
  IconUser,
  IconLogout,
  IconChevronDown,
  IconSparkles,
} from "@tabler/icons-react";
import { mockUserProfile } from "@/mocks/data";

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: IconLayoutDashboard },
  { href: "/my-concepts", label: "My Concepts", icon: IconFolder },
];

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const profile = mockUserProfile;

  // Don't show nav on landing or onboarding
  if (pathname === "/" || pathname === "/start") {
    return null;
  }

  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <Box
      component="header"
      style={{
        borderBottom: "1px solid var(--mantine-color-gray-2)",
        backgroundColor: "white",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <Container size="xl">
        <Group h={60} justify="space-between">
          {/* Logo / Brand */}
          <Group
            gap="xs"
            style={{ cursor: "pointer" }}
            onClick={() => router.push("/dashboard")}
          >
            <IconSparkles size={24} color="var(--mantine-color-blue-6)" />
            <Text fw={700} size="lg">
              LeTrend
            </Text>
          </Group>

          {/* Nav links */}
          <Group gap="xs">
            {navLinks.map((link) => (
              <Button
                key={link.href}
                variant={isActive(link.href) ? "light" : "subtle"}
                leftSection={<link.icon size={18} />}
                onClick={() => router.push(link.href)}
                color={isActive(link.href) ? "blue" : "gray"}
              >
                {link.label}
              </Button>
            ))}
          </Group>

          {/* User menu */}
          <Menu shadow="md" width={220} position="bottom-end">
            <Menu.Target>
              <Button variant="subtle" color="gray" px="xs">
                <Group gap="sm">
                  <Avatar size="sm" color="blue" radius="xl">
                    {profile.businessName.charAt(0)}
                  </Avatar>
                  <Text size="sm" fw={500} visibleFrom="sm">
                    {profile.businessName}
                  </Text>
                  <IconChevronDown size={14} />
                </Group>
              </Button>
            </Menu.Target>

            <Menu.Dropdown>
              <Menu.Label>Account</Menu.Label>
              <Menu.Item
                leftSection={<IconUser size={16} />}
                onClick={() => router.push("/profile")}
              >
                Profile settings
              </Menu.Item>
              <Menu.Item
                leftSection={<IconFolder size={16} />}
                onClick={() => router.push("/my-concepts")}
              >
                My concepts
              </Menu.Item>

              <Divider my="xs" />

              <Menu.Item
                leftSection={<IconLogout size={16} />}
                color="red"
                onClick={() => router.push("/")}
              >
                Sign out
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Container>
    </Box>
  );
}
