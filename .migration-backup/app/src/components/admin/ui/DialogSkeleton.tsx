import { Skeleton, Stack, Grid } from '@mantine/core';

export default function DialogSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <Stack gap="md">
        <Skeleton h={24} w={224} />
        <Skeleton h={16} w={320} maw="100%" />
        <Grid>
          <Grid.Col span={6}>
            <Skeleton h={48} radius="md" />
          </Grid.Col>
          <Grid.Col span={6}>
            <Skeleton h={48} radius="md" />
          </Grid.Col>
        </Grid>
        <Skeleton h={192} radius="lg" />
      </Stack>
    </div>
  );
}
