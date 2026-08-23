/**
 * ChitChat Centralized Cloudinary System Avatar Registry (Frontend)
 *
 * Single source of truth for all pre-uploaded system avatars in Cloudinary.
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

export const USER_AVATAR_ITEMS = {
  default: {
    key: "default-user",
    label: "Default Avatar",
    url: DEFAULT_USER_AVATAR_URL,
    type: "system",
  },
  male: [
    { key: "male1", label: "Male 1", url: MALE_AVATAR_URLS[0], type: "system" },
    { key: "male2", label: "Male 2", url: MALE_AVATAR_URLS[1], type: "system" },
    { key: "male3", label: "Male 3", url: MALE_AVATAR_URLS[2], type: "system" },
  ],
  female: [
    { key: "female1", label: "Female 1", url: FEMALE_AVATAR_URLS[0], type: "system" },
    { key: "female2", label: "Female 2", url: FEMALE_AVATAR_URLS[1], type: "system" },
    { key: "female3", label: "Female 3", url: FEMALE_AVATAR_URLS[2], type: "system" },
  ],
};

export const GROUP_AVATAR_ITEMS = {
  default: {
    key: "default-group",
    label: "Default Group",
    url: DEFAULT_GROUP_AVATAR_URL,
    type: "system",
  },
  presets: [
    { key: "group1", label: "Group 1", url: GROUP_AVATAR_URLS[0], type: "system" },
    { key: "group2", label: "Group 2", url: GROUP_AVATAR_URLS[1], type: "system" },
    { key: "group3", label: "Group 3", url: GROUP_AVATAR_URLS[2], type: "system" },
  ],
};

export default SYSTEM_AVATARS;
