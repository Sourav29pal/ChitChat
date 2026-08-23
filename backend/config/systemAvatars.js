/**
 * ChitChat Centralized Cloudinary System Avatar Registry (Backend)
 *
 * Single source of truth for all approved system avatars.
 * Total assets: 10 (1 User Default, 1 Group Default, 3 Male, 3 Female, 3 Group Presets)
 */

export const DEFAULT_USER_AVATAR_URL =
  "https://res.cloudinary.com/wixnbvgn/image/upload/v1787446690/ChitChat_App/ChitChat_App_Avatars/ChitChat_App_Avatars_Default/default-user.svg";

export const DEFAULT_GROUP_AVATAR_URL =
  "https://res.cloudinary.com/wixnbvgn/image/upload/v1787446695/ChitChat_App/ChitChat_App_Avatars/ChitChat_App_Avatars_Default/default-group.svg";

export const MALE_AVATAR_URLS = [
  "https://res.cloudinary.com/wixnbvgn/image/upload/v1787446702/ChitChat_App/ChitChat_App_Avatars/ChitChat_App_Avatars_Male/male1.svg",
  "https://res.cloudinary.com/wixnbvgn/image/upload/v1787446710/ChitChat_App/ChitChat_App_Avatars/ChitChat_App_Avatars_Male/male2.svg",
  "https://res.cloudinary.com/wixnbvgn/image/upload/v1787446719/ChitChat_App/ChitChat_App_Avatars/ChitChat_App_Avatars_Male/male3.svg",
];

export const FEMALE_AVATAR_URLS = [
  "https://res.cloudinary.com/wixnbvgn/image/upload/v1787446728/ChitChat_App/ChitChat_App_Avatars/ChitChat_App_Avatars_Female/female1.svg",
  "https://res.cloudinary.com/wixnbvgn/image/upload/v1787446742/ChitChat_App/ChitChat_App_Avatars/ChitChat_App_Avatars_Female/female2.svg",
  "https://res.cloudinary.com/wixnbvgn/image/upload/v1787446754/ChitChat_App/ChitChat_App_Avatars/ChitChat_App_Avatars_Female/female3.svg",
];

export const GROUP_AVATAR_URLS = [
  "https://res.cloudinary.com/wixnbvgn/image/upload/v1787446767/ChitChat_App/ChitChat_App_Avatars/ChitChat_App_Avatars_Group/group1.svg",
  "https://res.cloudinary.com/wixnbvgn/image/upload/v1787446772/ChitChat_App/ChitChat_App_Avatars/ChitChat_App_Avatars_Group/group2.svg",
  "https://res.cloudinary.com/wixnbvgn/image/upload/v1787446774/ChitChat_App/ChitChat_App_Avatars/ChitChat_App_Avatars_Group/group3.svg",
];

export const ALL_SYSTEM_AVATAR_URLS = new Set([
  DEFAULT_USER_AVATAR_URL,
  DEFAULT_GROUP_AVATAR_URL,
  ...MALE_AVATAR_URLS,
  ...FEMALE_AVATAR_URLS,
  ...GROUP_AVATAR_URLS,
]);

export const SYSTEM_AVATARS = {
  user: {
    default: DEFAULT_USER_AVATAR_URL,
    male: MALE_AVATAR_URLS,
    female: FEMALE_AVATAR_URLS,
  },
  group: {
    default: DEFAULT_GROUP_AVATAR_URL,
    presets: GROUP_AVATAR_URLS,
  },
};

/**
 * Validates whether a given URL is an approved ChitChat system avatar
 * @param {string} url
 * @returns {boolean}
 */
export const isApprovedSystemAvatarUrl = (url) => {
  if (!url || typeof url !== "string") return false;
  const cleanUrl = url.trim();
  return (
    ALL_SYSTEM_AVATAR_URLS.has(cleanUrl) ||
    cleanUrl.includes("ChitChat_App/ChitChat_App_Avatars") ||
    cleanUrl.includes("ChitChat_App_Avatars")
  );
};

export default SYSTEM_AVATARS;
