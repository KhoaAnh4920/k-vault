"use client";

import { useSession } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Film, Clock, Shield, Mail, User } from "lucide-react";

export default function ProfilePage() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-12">
        <div className="flex flex-col items-center gap-6">
          <Skeleton className="h-24 w-24 rounded-full" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
    );
  }

  const user = session?.user;
  const roles = user?.roles ?? [];
  const initials =
    user?.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) ?? "?";

  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">
      {/* Hero Section */}
      <div className="flex flex-col items-center text-center gap-4 mb-10">
        <Avatar className="h-24 w-24 ring-4 ring-primary/20 ring-offset-4 ring-offset-background">
          <AvatarImage src={user?.image ?? undefined} alt={user?.name ?? ""} />
          <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {user?.name ?? "Anonymous"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {user?.email ?? "No email on file"}
          </p>
        </div>
        <div className="flex gap-2">
          {roles.map((role) => (
            <Badge key={role} variant="secondary" className="capitalize">
              {role}
            </Badge>
          ))}
          {roles.length === 0 && (
            <Badge variant="outline" className="text-muted-foreground">
              Viewer
            </Badge>
          )}
        </div>
      </div>

      <Separator className="mb-8" />

      {/* Info Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-xs uppercase tracking-wider">
              <User className="h-3.5 w-3.5" />
              Display Name
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CardTitle className="text-lg">{user?.name ?? "—"}</CardTitle>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-xs uppercase tracking-wider">
              <Mail className="h-3.5 w-3.5" />
              Email
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CardTitle className="text-lg truncate">
              {user?.email ?? "—"}
            </CardTitle>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-xs uppercase tracking-wider">
              <Shield className="h-3.5 w-3.5" />
              Access Level
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CardTitle className="text-lg capitalize">
              {roles.length > 0 ? roles.join(", ") : "Viewer"}
            </CardTitle>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-xs uppercase tracking-wider">
              <Film className="h-3.5 w-3.5" />
              Platform
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CardTitle className="text-lg">K-Vault</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Self-hosted VOD
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Activity Placeholder */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Recent Activity
          </CardTitle>
          <CardDescription>
            Watch history and activity will appear here in a future update.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            No activity recorded yet.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
