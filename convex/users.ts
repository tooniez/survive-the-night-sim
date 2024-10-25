import { getAuthUserId } from "@convex-dev/auth/server";
import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not signed in");
    }
    const user = await ctx.db.get(userId);
    if (user === null) {
      throw new Error("User was deleted");
    }
    return user;
  },
});

export const getUserOrNull = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }
    return await ctx.db.get(userId);
  },
});

export const isAdmin = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return false;
    }

    const admin = await ctx.db
      .query("admins")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    return !!admin;
  },
});

export const adminQueryBuilder = customQuery(
  query,
  customCtx(async (ctx) => {
    const userId = await getAuthUserId(ctx);

    if (userId === null) {
      throw new Error("Unauthorized");
    }

    const admin = await ctx.db
      .query("admins")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!admin) {
      throw new Error("Admin only invocation called from non-admin user");
    }

    return {
      admin: {
        id: admin.userId,
      },
    };
  }),
);

export const adminMutationBuilder = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const userId = await getAuthUserId(ctx);

    if (userId === null) {
      throw new Error("Unauthorized");
    }

    const admin = await ctx.db
      .query("admins")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!admin) {
      throw new Error("Admin only invocation called from non-admin user");
    }

    return {
      admin: {
        id: admin.userId,
      },
    };
  }),
);

export const SIGN_IN_ERROR_MESSAGE =
  "You must be signed in to perform this action";

export const authenticatedMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const userId = await getAuthUserId(ctx);

    if (userId === null) {
      throw new ConvexError(SIGN_IN_ERROR_MESSAGE);
    }

    return {
      userId,
    };
  }),
);

export const deleteUserById = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    if (args.userId === null) {
      throw new ConvexError(SIGN_IN_ERROR_MESSAGE);
    }

    const userResults = await ctx.db
      .query("userResults")
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .collect();
    for (const result of userResults) {
      await ctx.db.delete(result._id);
    }

    const maps = await ctx.db
      .query("maps")
      .filter((q) => q.eq(q.field("submittedBy"), args.userId))
      .collect();
    for (const map of maps) {
      await ctx.db.patch(map._id, { submittedBy: undefined });
    }

    const authAccounts = await ctx.db.query("authAccounts").filter(q => q.eq(q.field("userId"), args.userId)).collect();

    // Iterate over the queried documents and delete each one
    for (const account of authAccounts) {
      await ctx.db.delete(account._id);
    }

    const admin = await ctx.db
      .query("admins")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    if (admin) {
      await ctx.db.delete(admin._id);
    }

    await ctx.db.delete(args.userId);
  },
});
