import { NextResponse } from "next/server";
import { auth0Service, Auth0UserError } from "@/lib/auth0Service";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      name?: string;
    };
    const { email, password, name } = body;

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: "Email, password and name are required" },
        { status: 400 },
      );
    }

    const exists = await auth0Service.checkEmailExists(email);
    if (exists) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 },
      );
    }

    await auth0Service.createUser(email, password, name);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Auth0UserError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error("[signup route] unexpected error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again later." },
      { status: 500 },
    );
  }
}
