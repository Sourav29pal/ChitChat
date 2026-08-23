import React, { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import Message from "./Message.jsx";
import useGetMessage from "../../context/useGetMessage.js";
import Loading from "../../components/Loading.jsx";
import useConversation from "../../zustand/useConversation";
import { useAuth } from "../../context/AuthProvider.jsx";
import { FiLoader, FiUsers, FiTrash2, FiCheckSquare, FiX, FiSmile, FiCopy, FiChevronDown, FiAlertTriangle } from "react-icons/fi";
import { ImSpinner8 } from "react-icons/im";
import { HiChatBubbleLeftRight } from "react-icons/hi2";
import api from "../../api";
import toast from "react-hot-toast";
import ProfileActionPopup from "../../components/ProfileActionPopup";

const getFormattedDateLabel = (dateInput) => {
    if (!dateInput) return "";
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return "";

    const now = new Date();
    // Midnight of today in local timezone
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Midnight of message date in local timezone
    const startOfMsgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    // Difference in calendar days (local time)
    const diffMs = startOfToday.getTime() - startOfMsgDay.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";

    // Within recent weekday range: 2 to 6 days ago
    if (diffDays >= 2 && diffDays < 7) {
        return date.toLocaleDateString(undefined, { weekday: "long" });
    }

    // Older: "11 July 2026"
    const day = date.getDate();
    const month = date.toLocaleDateString(undefined, { month: "long" });
    const year = date.getFullYear();

    return `${day} ${month} ${year}`;
};

const shouldShowDateSeparator = (messages, index) => {
    if (index === 0) {
        return true;
    }
    const currMsg = messages[index];
    const prevMsg = messages[index - 1];
    if (!currMsg?.createdAt || !prevMsg?.createdAt) return false;

    const currentDate = new Date(currMsg.createdAt);
    const previousDate = new Date(prevMsg.createdAt);

    if (isNaN(currentDate.getTime()) || isNaN(previousDate.getTime())) return false;

    return (
        currentDate.getFullYear() !== previousDate.getFullYear() ||
        currentDate.getMonth() !== previousDate.getMonth() ||
        currentDate.getDate() !== previousDate.getDate()
    );
};

const isSameDay = (m1, m2) => {
    if (!m1?.createdAt || !m2?.createdAt) return false;
    const d1 = new Date(m1.createdAt);
    const d2 = new Date(m2.createdAt);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return false;
    return (
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate()
    );
};

function Messages() {
    const {
        loading,
        loadingMore,
        loadingNewer,
        loadingUnreadBacklog,
        hasMore,
        hasMoreAfter,
        messages,          // historical messages (API-sourced)
        loadMoreMessages,
        loadUnreadBacklog,
        loadNewerMessages,
        unreadCount,
        firstUnreadMessageId,
        lastUnreadMessageId,
        loadedConversationId,
    } = useGetMessage();

    // realtimeMessages: socket-delivered messages, always appended AFTER
    // historical messages in the rendered conversation.
    const {
        selectedConversation,
        setSelectedConversation,
        realtimeMessages,
        updateMessageInStore,
        setLastMessage,
        lastMessages,
        messages: historicalMessages,
        setActiveReactMessageId,
        clearChatLocally,
    } = useConversation();

    const [authUser] = useAuth();
    const currentUserId = String(authUser?.user?._id || authUser?._id || "");
    const myId = currentUserId;

    // Profile Action Popup State
    const [profilePopupUser, setProfilePopupUser] = useState(null);

    // ─── Derived display list ─────────────────────────────────────────────────
    // Combines historical API messages and socket realtime messages into a single,
    // deduplicated, strictly chronological (ascending) collection.
    const displayedMessages = useMemo(() => {
        const rawList = [
            ...(Array.isArray(messages) ? messages : []),
            ...(Array.isArray(realtimeMessages) ? realtimeMessages : []),
        ];

        // 1. Deduplicate by unique MongoDB _id while preserving valid messages
        const seenIds = new Set();
        const uniqueMessages = [];
        for (const msg of rawList) {
            if (!msg) continue;
            const idStr = msg._id ? String(msg._id) : null;
            if (idStr) {
                if (!seenIds.has(idStr)) {
                    seenIds.add(idStr);
                    uniqueMessages.push(msg);
                }
            } else {
                // Fallback in the rare event of a message without _id
                uniqueMessages.push(msg);
            }
        }

        // 2. Deterministic ascending chronological sort matching MongoDB { createdAt: 1, _id: 1 }
        return uniqueMessages.sort((a, b) => {
            const timeA = new Date(a.createdAt || 0).getTime();
            const timeB = new Date(b.createdAt || 0).getTime();
            if (timeA !== timeB) return timeA - timeB;
            const idA = a._id ? String(a._id) : "";
            const idB = b._id ? String(b._id) : "";
            return idA.localeCompare(idB);
        });
    }, [messages, realtimeMessages]);

    // ─── Filtered Visible Messages List (Excludes isDeletedForMe) ──────────────
    const visibleMessages = useMemo(
        () => displayedMessages.filter((m) => !m.isDeletedForMe),
        [displayedMessages]
    );

    // Fast ID -> Message lookup map for scroll inspections
    const messageMap = useMemo(() => {
        const map = new Map();
        displayedMessages.forEach((m) => {
            if (m?._id) map.set(String(m._id), m);
        });
        return map;
    }, [displayedMessages]);

    // ─── DOM refs ────────────────────────────────────────────────────────────
    const scrollContainerRef = useRef(null);
    const firstUnreadRef = useRef(null);
    const messagesEndRef = useRef(null);

    // ─── Initialization / pagination refs ────────────────────────────────────
    const isInitializedRef = useRef(false);
    const initialScrollDoneRef = useRef(false);
    const scrollGenerationRef = useRef(0);

    const loadingOlderRef = useRef(false);
    const loadingNewerRef = useRef(false);

    const previousScrollHeightRef = useRef(0);
    const previousScrollTopRef = useRef(0);

    // Downward pagination scroll compensation refs
    const newerLoadPreviousScrollHeightRef = useRef(0);
    const newerLoadPreviousScrollTopRef = useRef(0);
    const newerLoadWasAtOrBelowBoundaryRef = useRef(false);

    const previousLastMessageIdRef = useRef(null);
    const previousMessageCountRef = useRef(0);

    // ─── Bottom-of-scroll tracking ────────────────────────────────────────────
    const isAtBottomRef = useRef(true);

    // ─── CLEAN STATE MODEL ───────────────────────────────────────────────────
    const realtimeBatchRef = useRef(null);
    const registeredRealtimeIdsRef = useRef(new Set());

    const [arrowState, setArrowState] = React.useState({ mode: "none", count: 0 });
    const [separatorData, setSeparatorData] = React.useState(null);

    const isProgrammaticScrollRef = useRef(false);

    // ─── WhatsApp-style Sticky Date Indicator State & Refs ────────────────────
    const [stickyDate, setStickyDate] = React.useState("");
    const [isStickyDateVisible, setIsStickyDateVisible] = React.useState(false);
    const stickyHideTimerRef = useRef(null);

    // ─── Selection & Context Menu State ───────────────────────────────────────
    const [selectedMessageIds, setSelectedMessageIds] = useState(() => new Set());
    const [isManualSelectionMode, setIsManualSelectionMode] = useState(false);
    const isSelectionMode = isManualSelectionMode || selectedMessageIds.size > 0;

    // Right-click context menu: { x: number, y: number, message: object | null }
    const [contextMenu, setContextMenu] = useState(null);

    // Multi-message delete options modal (opened via top delete icon)
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    // Single-message delete options modal (opened via message right-click)
    const [singleDeleteMessage, setSingleDeleteMessage] = useState(null);
    const [showSingleDeleteModal, setShowSingleDeleteModal] = useState(false);

    // Clear Chat modal state
    const [showClearChatModal, setShowClearChatModal] = useState(false);
    const [clearTimeRange, setClearTimeRange] = useState("today"); // "today" | "week" | "month" | "all"
    const [clearingChat, setClearingChat] = useState(false);

    // ─── Dynamic Clear Chat Range Options (Based on visible messages/calls) ───
    const availableRangeOptions = useMemo(() => {
        if (!visibleMessages || visibleMessages.length === 0) return [];

        const now = Date.now();
        const todayMidnight = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), 0, 0, 0, 0).getTime();
        const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
        const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

        const hasToday = visibleMessages.some((m) => new Date(m.createdAt || 0).getTime() >= todayMidnight);
        const hasWeek = visibleMessages.some((m) => new Date(m.createdAt || 0).getTime() >= sevenDaysAgo);
        const hasMonth = visibleMessages.some((m) => new Date(m.createdAt || 0).getTime() >= thirtyDaysAgo);
        const hasAll = visibleMessages.length > 0;

        const options = [];
        if (hasToday) {
            options.push({ id: "today", title: "Today", desc: "Messages and calls from today" });
        }
        if (hasWeek) {
            options.push({ id: "week", title: "Last 7 Days", desc: "Messages and calls from the last 7 days" });
        }
        if (hasMonth) {
            options.push({ id: "month", title: "Last 30 Days", desc: "Messages and calls from the last 30 days" });
        }
        if (hasAll) {
            options.push({ id: "all", title: "Entire Chat", desc: "All messages and calls in this conversation" });
        }

        return options;
    }, [visibleMessages]);

    // Range selection stability: auto-fallback if selected range is not available
    useEffect(() => {
        if (availableRangeOptions.length > 0) {
            const isCurrentValid = availableRangeOptions.some((o) => o.id === clearTimeRange);
            if (!isCurrentValid) {
                setClearTimeRange(availableRangeOptions[0].id);
            }
        }
    }, [availableRangeOptions, clearTimeRange]);

    // Toggle a single message in/out of the selection set.
    const handleToggleSelect = useCallback((messageId) => {
        setSelectedMessageIds((prev) => {
            const next = new Set(prev);
            if (next.has(messageId)) {
                next.delete(messageId);
            } else {
                next.add(messageId);
            }
            return next;
        });
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedMessageIds(new Set());
        setIsManualSelectionMode(false);
        setShowDeleteModal(false);
        setShowSingleDeleteModal(false);
        setSingleDeleteMessage(null);
    }, []);

    // ─── Delete-for-Me state (Phase 4) ────────────────────────────────────────
    const pendingDeleteRef = useRef(null);  // { messageIds: string[], conversationId: string } | null
    const undoTimerRef = useRef(null);

    const [undoVisible, setUndoVisible] = useState(false);
    // undoProgress drives the countdown bar width (100 → 0 over 5 seconds)
    const [undoProgress, setUndoProgress] = useState(100);
    const undoProgressIntervalRef = useRef(null);
    const currentStickyDateRef = useRef("");

    // ─── Window listeners for Context Menu dismissal ─────────────────────────
    useEffect(() => {
        const handleCloseContextMenu = () => setContextMenu(null);
        window.addEventListener("click", handleCloseContextMenu);
        window.addEventListener("scroll", handleCloseContextMenu, true);
        return () => {
            window.removeEventListener("click", handleCloseContextMenu);
            window.removeEventListener("scroll", handleCloseContextMenu, true);
        };
    }, []);

    // ─── Conversation change — reset everything ───────────────────────────────
    useEffect(() => {
        isInitializedRef.current = false;
        initialScrollDoneRef.current = false;
        loadingOlderRef.current = false;
        loadingNewerRef.current = false;

        previousScrollHeightRef.current = 0;
        previousScrollTopRef.current = 0;
        previousMessageCountRef.current = 0;
        previousLastMessageIdRef.current = null;

        newerLoadPreviousScrollHeightRef.current = 0;
        newerLoadPreviousScrollTopRef.current = 0;
        newerLoadWasAtOrBelowBoundaryRef.current = false;

        isAtBottomRef.current = true;
        isProgrammaticScrollRef.current = false;

        realtimeBatchRef.current = null;
        registeredRealtimeIdsRef.current.clear();

        setArrowState({ mode: "none", count: 0 });
        setSeparatorData(null);

        // Reset Sticky Date
        if (stickyHideTimerRef.current) {
            clearTimeout(stickyHideTimerRef.current);
            stickyHideTimerRef.current = null;
        }
        setIsStickyDateVisible(false);
        setStickyDate("");
        currentStickyDateRef.current = "";

        scrollGenerationRef.current += 1;

        // Clear message selection & context menu when switching conversations
        setSelectedMessageIds(new Set());
        setIsManualSelectionMode(false);
        setContextMenu(null);
        setShowDeleteModal(false);
        setShowSingleDeleteModal(false);
        setSingleDeleteMessage(null);

        // Cancel any pending undo when switching conversation.
        if (undoTimerRef.current) {
            clearTimeout(undoTimerRef.current);
            undoTimerRef.current = null;
        }
        if (undoProgressIntervalRef.current) {
            clearInterval(undoProgressIntervalRef.current);
            undoProgressIntervalRef.current = null;
        }
        pendingDeleteRef.current = null;
        setUndoVisible(false);

        return () => {
            if (undoTimerRef.current) {
                clearTimeout(undoTimerRef.current);
                undoTimerRef.current = null;
            }
            if (undoProgressIntervalRef.current) {
                clearInterval(undoProgressIntervalRef.current);
                undoProgressIntervalRef.current = null;
            }
        };
    }, [selectedConversation?._id]);

    // ─── Scroll handler ───────────────────────────────────────────────────────
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const handleScroll = () => {
            // ── Update WhatsApp-style Sticky Date Indicator ───────────────────
            if (displayedMessages.length > 0) {
                if (stickyHideTimerRef.current) {
                    clearTimeout(stickyHideTimerRef.current);
                }

                const containerTop = container.getBoundingClientRect().top;
                const messageEls = container.querySelectorAll("[data-message-id]");

                let topMsgId = null;
                for (let i = 0; i < messageEls.length; i++) {
                    const rect = messageEls[i].getBoundingClientRect();
                    if (rect.bottom > containerTop + 24) {
                        topMsgId = messageEls[i].getAttribute("data-message-id");
                        break;
                    }
                }

                if (!topMsgId && messageEls.length > 0) {
                    topMsgId = messageEls[0].getAttribute("data-message-id");
                }

                if (topMsgId) {
                    const topMsg = messageMap.get(String(topMsgId));
                    if (topMsg && topMsg.createdAt) {
                        const dateLabel = getFormattedDateLabel(topMsg.createdAt);
                        if (dateLabel) {
                            if (dateLabel !== currentStickyDateRef.current) {
                                currentStickyDateRef.current = dateLabel;
                                setStickyDate(dateLabel);
                            }
                            setIsStickyDateVisible(true);

                            stickyHideTimerRef.current = setTimeout(() => {
                                setIsStickyDateVisible(false);
                            }, 1500);
                        }
                    }
                }
            }

            // ── Normal Upward Scroll: Load older messages ─────────────────────
            if (
                container.scrollTop <= 60 &&
                hasMore &&
                !loadingMore &&
                !loadingOlderRef.current
            ) {
                loadingOlderRef.current = true;
                previousScrollHeightRef.current = container.scrollHeight;
                previousScrollTopRef.current = container.scrollTop;

                loadMoreMessages().finally(() => {
                    loadingOlderRef.current = false;
                });
            }

            // ── Downward Scroll: Load newer messages ───────────────────────────
            const distFromBottom =
                container.scrollHeight -
                container.scrollTop -
                container.clientHeight;

            if (
                distFromBottom <= 80 &&
                hasMoreAfter &&
                !loadingNewerRef.current
            ) {
                loadingNewerRef.current = true;
                newerLoadPreviousScrollHeightRef.current = container.scrollHeight;
                newerLoadPreviousScrollTopRef.current = container.scrollTop;
                newerLoadWasAtOrBelowBoundaryRef.current = distFromBottom <= 10;

                loadNewerMessages().finally(() => {
                    loadingNewerRef.current = false;
                });
            }

            // ── Arrow visibility management ───────────────────────────────────
            if (isProgrammaticScrollRef.current) return;

            const atBottom = distFromBottom <= 80;
            isAtBottomRef.current = atBottom;

            if (atBottom) {
                realtimeBatchRef.current = null;
                setArrowState({ mode: "none", count: 0 });
            } else {
                const batch = realtimeBatchRef.current;
                if (batch && batch.count > 0) {
                    setArrowState({ mode: "numbered", count: batch.count });
                } else {
                    setArrowState({ mode: "plain", count: 0 });
                }
            }
        };

        container.addEventListener("scroll", handleScroll, { passive: true });
        return () => {
            container.removeEventListener("scroll", handleScroll);
            if (stickyHideTimerRef.current) {
                clearTimeout(stickyHideTimerRef.current);
            }
        };
    }, [
        hasMore,
        hasMoreAfter,
        loadMoreMessages,
        loadNewerMessages,
        displayedMessages,
        messageMap,
    ]);

    // ─── Historical message load layout effects ───────────────────────────────
    React.useLayoutEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        if (previousScrollHeightRef.current > 0) {
            const newScrollHeight = container.scrollHeight;
            const heightDifference =
                newScrollHeight - previousScrollHeightRef.current;
            container.scrollTop =
                previousScrollTopRef.current + heightDifference;
            previousScrollHeightRef.current = 0;
            previousScrollTopRef.current = 0;
        }

        if (newerLoadPreviousScrollHeightRef.current > 0) {
            if (newerLoadWasAtOrBelowBoundaryRef.current) {
                container.scrollTop = container.scrollHeight;
            } else {
                container.scrollTop = newerLoadPreviousScrollTopRef.current;
            }
            newerLoadPreviousScrollHeightRef.current = 0;
            newerLoadPreviousScrollTopRef.current = 0;
            newerLoadWasAtOrBelowBoundaryRef.current = false;
        }
    }, [messages]);

    // ─── Initial open & position positioning effect ────────────────────────────
    React.useLayoutEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const currentConvId = selectedConversation?._id;
        if (!currentConvId || loadedConversationId !== currentConvId) {
            return;
        }

        if (loading) {
            return;
        }

        if (displayedMessages.length === 0) {
            isInitializedRef.current = true;
            initialScrollDoneRef.current = true;
            isAtBottomRef.current = true;
            previousMessageCountRef.current = 0;
            previousLastMessageIdRef.current = null;
            return;
        }

        if (!isInitializedRef.current) {
            isInitializedRef.current = true;

            const isInitialBacklogPhase =
                unreadCount > 0 &&
                firstUnreadMessageId &&
                lastUnreadMessageId &&
                !hasMoreAfter;

            if (isInitialBacklogPhase) {
                const targetEl = container.querySelector(
                    `[data-message-id="${firstUnreadMessageId}"]`
                );
                if (targetEl) {
                    targetEl.scrollIntoView({
                        behavior: "instant",
                        block: "center",
                    });
                } else {
                    container.scrollTop = 0;
                }

                isAtBottomRef.current = false;
                setArrowState({ mode: "plain", count: 0 });

                loadUnreadBacklog().then(() => {
                    requestAnimationFrame(() => {
                        const postEl = container.querySelector(
                            `[data-message-id="${firstUnreadMessageId}"]`
                        );
                        if (postEl) {
                            postEl.scrollIntoView({
                                behavior: "instant",
                                block: "center",
                            });
                        }
                    });
                });

                initialScrollDoneRef.current = true;
                return;
            }

            if (unreadCount > 0 && firstUnreadRef.current) {
                firstUnreadRef.current.scrollIntoView({
                    behavior: "instant",
                    block: "center",
                });
                isAtBottomRef.current = false;
                setArrowState({ mode: "plain", count: 0 });
            } else {
                container.scrollTop = container.scrollHeight;
                if (messagesEndRef.current) {
                    messagesEndRef.current.scrollIntoView({ behavior: "instant", block: "end" });
                }
                isAtBottomRef.current = true;
                setArrowState({ mode: "none", count: 0 });

                // Multi-pass scroll-down to account for sub-pixel text reflow, avatars, and fonts
                requestAnimationFrame(() => {
                    if (container) {
                        container.scrollTop = container.scrollHeight;
                        messagesEndRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
                    }
                });

                setTimeout(() => {
                    if (container && isAtBottomRef.current) {
                        container.scrollTop = container.scrollHeight;
                        messagesEndRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
                    }
                }, 60);

                setTimeout(() => {
                    if (container && isAtBottomRef.current) {
                        container.scrollTop = container.scrollHeight;
                        messagesEndRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
                    }
                }, 180);
            }

            initialScrollDoneRef.current = true;
            return;
        }

        const prevCount = previousMessageCountRef.current;
        const currCount = displayedMessages.length;
        const prevLastId = previousLastMessageIdRef.current;
        const currLastId =
            currCount > 0 ? displayedMessages[currCount - 1]._id : null;

        const hasAppendedAtBottom =
            currCount > prevCount &&
            (prevLastId === null || currLastId !== prevLastId);

        // Check if the newly appended bottom message was sent by the current user
        const lastMessage = currCount > 0 ? displayedMessages[currCount - 1] : null;
        const isLastMsgMine = Boolean(
            lastMessage &&
            (() => {
                const senderId =
                    typeof lastMessage.senderId === "object"
                        ? String(lastMessage.senderId?._id)
                        : String(lastMessage.senderId);
                return senderId === currentUserId;
            })()
        );

        if (hasAppendedAtBottom && (isAtBottomRef.current || isLastMsgMine)) {
            isProgrammaticScrollRef.current = true;
            container.scrollTop = container.scrollHeight;
            messagesEndRef.current?.scrollIntoView({
                behavior: isLastMsgMine ? "smooth" : "instant",
                block: "end",
            });

            if (isLastMsgMine) {
                isAtBottomRef.current = true;
                realtimeBatchRef.current = null;
                setArrowState({ mode: "none", count: 0 });
            }

            requestAnimationFrame(() => {
                if (container) {
                    container.scrollTop = container.scrollHeight;
                    messagesEndRef.current?.scrollIntoView({
                        behavior: isLastMsgMine ? "smooth" : "instant",
                        block: "end",
                    });
                    isProgrammaticScrollRef.current = false;
                }
            });
            setTimeout(() => {
                if (container && isAtBottomRef.current) {
                    container.scrollTop = container.scrollHeight;
                    messagesEndRef.current?.scrollIntoView({
                        behavior: isLastMsgMine ? "smooth" : "instant",
                        block: "end",
                    });
                }
            }, 60);
        }

        previousMessageCountRef.current = currCount;
        previousLastMessageIdRef.current = currLastId;
    }, [
        messages,
        realtimeMessages,
        displayedMessages,
        loading,
        unreadCount,
        firstUnreadMessageId,
        lastUnreadMessageId,
        selectedConversation?._id,
        loadedConversationId,
        hasMoreAfter,
        loadUnreadBacklog,
    ]);

    // ─── Realtime message arrival effect ──────────────────────────────────────
    useEffect(() => {
        if (!Array.isArray(realtimeMessages) || realtimeMessages.length === 0)
            return;

        const registered = registeredRealtimeIdsRef.current;
        const newArrivals = realtimeMessages.filter(
            (m) => !registered.has(String(m._id))
        );
        if (newArrivals.length === 0) return;

        newArrivals.forEach((m) => registered.add(String(m._id)));

        const isSenderMe = (m) => {
            const senderId =
                typeof m.senderId === "object"
                    ? String(m.senderId?._id)
                    : String(m.senderId);
            return senderId === currentUserId;
        };

        const hasMyMessage = newArrivals.some(isSenderMe);
        const incomingCount = newArrivals.filter((m) => !isSenderMe(m)).length;

        if (hasMyMessage || isAtBottomRef.current || !initialScrollDoneRef.current) {
            initialScrollDoneRef.current = true;
            isInitializedRef.current = true;
            const container = scrollContainerRef.current;
            if (container) {
                isProgrammaticScrollRef.current = true;
                container.scrollTop = container.scrollHeight;
                messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
                const settle = () => {
                    isProgrammaticScrollRef.current = false;
                    isAtBottomRef.current = true;
                };
                container.addEventListener("scrollend", settle, { once: true });
                setTimeout(() => {
                    container.removeEventListener("scrollend", settle);
                    if (isProgrammaticScrollRef.current) settle();
                }, 600);
            }

            realtimeBatchRef.current = null;
            setArrowState({ mode: "none", count: 0 });
            return;
        }

        if (incomingCount > 0) {
            const currentBatch = realtimeBatchRef.current;
            const firstId = currentBatch
                ? currentBatch.firstId
                : String(newArrivals[0]._id);
            const totalCount = (currentBatch ? currentBatch.count : 0) + incomingCount;

            realtimeBatchRef.current = { firstId, count: totalCount };

            setSeparatorData((prev) => {
                if (prev === null) {
                    return { firstId, count: totalCount };
                }
                return { ...prev, count: totalCount };
            });

            setArrowState({ mode: "numbered", count: totalCount });
        }
    }, [realtimeMessages, currentUserId]);

    // ─── Arrow click handler ──────────────────────────────────────────────────
    const handleArrowClick = () => {
        const container = scrollContainerRef.current;
        if (!container) return;

        if (arrowState.mode === "numbered") {
            const batch = realtimeBatchRef.current;
            if (!batch?.firstId) return;

            const doJump = () => {
                const targetEl = container.querySelector(
                    `[data-message-id="${batch.firstId}"]`
                );
                if (!targetEl) return;

                isProgrammaticScrollRef.current = true;
                targetEl.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                });

                realtimeBatchRef.current = null;

                const settle = () => {
                    isProgrammaticScrollRef.current = false;
                    const dist =
                        container.scrollHeight -
                        container.scrollTop -
                        container.clientHeight;
                    const atBottom = dist <= 80;
                    isAtBottomRef.current = atBottom;
                    setArrowState(
                        atBottom
                            ? { mode: "none", count: 0 }
                            : { mode: "plain", count: 0 }
                    );
                };

                container.addEventListener("scrollend", settle, { once: true });
                setTimeout(() => {
                    container.removeEventListener("scrollend", settle);
                    if (isProgrammaticScrollRef.current) settle();
                }, 700);
            };

            if (unreadCount > 0 && firstUnreadMessageId && lastUnreadMessageId) {
                loadUnreadBacklog().then(() => {
                    requestAnimationFrame(() => {
                        doJump();
                    });
                });
            } else {
                doJump();
            }
        } else {
            isProgrammaticScrollRef.current = true;
            container.scrollTo({
                top: container.scrollHeight,
                behavior: "smooth",
            });

            const settle = () => {
                isProgrammaticScrollRef.current = false;
                isAtBottomRef.current = true;
                setArrowState({ mode: "none", count: 0 });
            };

            container.addEventListener("scrollend", settle, { once: true });
            setTimeout(() => {
                container.removeEventListener("scrollend", settle);
                if (isProgrammaticScrollRef.current) settle();
            }, 600);
        }
    };

    // ─── Context Menu (Right-Click) Handlers ──────────────────────────────────
    // Right-click on empty space: message is null
    const handleContainerContextMenu = (e) => {
        e.preventDefault();
        const menuWidth = 180;
        const menuHeight = 115;
        const offset = 6; // subtle distance from cursor corner
        const posX = Math.min(e.clientX + offset, window.innerWidth - menuWidth - 10);
        const posY = Math.min(e.clientY + offset, window.innerHeight - menuHeight - 10);

        setContextMenu({
            x: Math.max(10, posX),
            y: Math.max(10, posY),
            message: null,
        });
    };

    // Right-click specifically on a message bubble: message is passed
    const handleMessageContextMenu = (e, message) => {
        e.preventDefault();
        e.stopPropagation();
        const menuWidth = 180;
        const menuHeight = 155;
        const offset = 6; // subtle distance from cursor corner
        const posX = Math.min(e.clientX + offset, window.innerWidth - menuWidth - 10);
        const posY = Math.min(e.clientY + offset, window.innerHeight - menuHeight - 10);

        setContextMenu({
            x: Math.max(10, posX),
            y: Math.max(10, posY),
            message,
        });
    };

    // When clicking "Select messages" from empty space context menu:
    // Enter selection mode with 0 selected (do not auto-select any message)
    const handleSelectMessagesEmpty = () => {
        setIsManualSelectionMode(true);
        setSelectedMessageIds(new Set());
        setContextMenu(null);
    };

    // When clicking "Select message" from a message's context menu:
    // Enter selection mode and select this specific message
    const handleSelectSpecificMessage = (message) => {
        setIsManualSelectionMode(true);
        if (message?._id) {
            setSelectedMessageIds(new Set([String(message._id)]));
        }
        setContextMenu(null);
    };

    // When clicking a quick reaction from the context menu:
    const handleContextMenuReact = async (targetMsg, emoji) => {
        setContextMenu(null);
        if (!targetMsg?._id) return;
        const myId = String(authUser?.user?._id || "");
        const currentReactions = Array.isArray(targetMsg.reactions) ? [...targetMsg.reactions] : [];
        const existingIndex = currentReactions.findIndex((r) => {
            const uId = typeof r.userId === "object" ? String(r.userId?._id) : String(r.userId);
            return uId === myId && r.emoji === emoji;
        });

        let updatedReactions;
        if (existingIndex > -1) {
            updatedReactions = currentReactions.filter((_, idx) => idx !== existingIndex);
        } else {
            const filtered = currentReactions.filter((r) => {
                const uId = typeof r.userId === "object" ? String(r.userId?._id) : String(r.userId);
                return uId !== myId;
            });
            updatedReactions = [
                ...filtered,
                {
                    emoji,
                    userId: authUser?.user || { _id: myId, fullname: "You" },
                    createdAt: new Date(),
                },
            ];
        }

        updateMessageInStore(targetMsg._id, { reactions: updatedReactions });

        try {
            await api.post(`/api/message/react/${targetMsg._id}`, { emoji });
        } catch (err) {
            updateMessageInStore(targetMsg._id, { reactions: currentReactions });
            toast.error("Failed to react to message");
        }
    };

    const handleCloseChatFromContextMenu = () => {
        setContextMenu(null);
        clearSelection();
        setSelectedConversation(null);
    };

    // When confirming Clear Chat from the time-range modal:
    const handleConfirmClearChat = async () => {
        if (!selectedConversation?._id || clearingChat) return;
        setClearingChat(true);
        try {
            const conversationId = String(selectedConversation._id);
            const res = await api.post("/api/message/clear-chat", {
                conversationId,
                timeRange: clearTimeRange,
            });

            if (res.data?.success) {
                clearChatLocally(conversationId, clearTimeRange, res.data.sinceDate);
                toast.success("Chat cleared");
                setShowClearChatModal(false);
                setClearTimeRange("today");
            }
        } catch (err) {
            console.error("Error clearing chat:", err);
            toast.error(err?.response?.data?.error || "Failed to clear chat");
        } finally {
            setClearingChat(false);
        }
    };

    // When clicking "Copy" from a single message's context menu:
    const handleCopyMessage = async (targetMsg) => {
        setContextMenu(null);
        if (!targetMsg || typeof targetMsg.message !== "string" || !targetMsg.message) {
            return;
        }
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(targetMsg.message);
                toast.success("Message copied");
            } else {
                const textarea = document.createElement("textarea");
                textarea.value = targetMsg.message;
                textarea.style.position = "fixed";
                textarea.style.opacity = "0";
                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                const successful = document.execCommand("copy");
                document.body.removeChild(textarea);
                if (successful) {
                    toast.success("Message copied");
                } else {
                    toast.error("Failed to copy message");
                }
            }
        } catch (err) {
            console.error("Clipboard copy error:", err);
            toast.error("Failed to copy message");
        }
    };

    // When clicking "Delete message" from a single message's context menu:
    const handleDeleteMessageFromContextMenu = (message) => {
        setContextMenu(null);
        if (message) {
            setSingleDeleteMessage(message);
            setShowSingleDeleteModal(true);
        }
    };

    // Helper: is this message sent by the authenticated user
    const isMyMessage = useCallback((msg) => {
        if (!msg) return false;
        const sId = typeof msg.senderId === "object" ? String(msg.senderId?._id) : String(msg.senderId);
        return sId === currentUserId;
    }, [currentUserId]);

    // Helper: is this message eligible for Delete for Everyone (owned by current user AND not already deleted for everyone)
    const canDeleteSingleForEveryone = useCallback((msg) => {
        if (!msg) return false;
        const sId = typeof msg.senderId === "object" ? String(msg.senderId?._id) : String(msg.senderId);
        return sId === currentUserId && !msg.deletedForAll;
    }, [currentUserId]);

    // ─── Execute Delete for Me ────────────────────────────────────────────────
    const executeDeleteForMe = useCallback(async (idsToDelete) => {
        if (!idsToDelete || idsToDelete.length === 0) return;
        const snapshotConvId = String(selectedConversation?._id || "");

        // Cancel any in-flight undo window.
        if (undoTimerRef.current) { clearTimeout(undoTimerRef.current); undoTimerRef.current = null; }
        if (undoProgressIntervalRef.current) { clearInterval(undoProgressIntervalRef.current); undoProgressIntervalRef.current = null; }

        // Optimistic UI — hide messages immediately.
        idsToDelete.forEach((id) => updateMessageInStore(id, { isDeletedForMe: true }));

        // Clear selection so the action bar disappears.
        clearSelection();

        // Sidebar — update client-side to the latest remaining visible message
        const deletedSet = new Set(idsToDelete.map(String));
        const remainingVisible = displayedMessages.filter(
            (m) => !deletedSet.has(String(m._id)) && !m.isDeletedForMe
        );
        const newLast = remainingVisible[remainingVisible.length - 1] || null;

        setLastMessage(
            snapshotConvId,
            newLast
                ? {
                      _id: newLast._id,
                      text: newLast.deletedForAll
                          ? "This message was deleted"
                          : (newLast.message || (newLast.attachmentUrl ? "📷 Photo" : "")),
                      messageType: newLast.messageType || (newLast.attachmentUrl ? "image" : "text"),
                      senderId: newLast.senderId,
                      status: newLast.status || "sent",
                      createdAt: newLast.createdAt,
                      callDetails: newLast.callDetails,
                  }
                : { text: "", isEmpty: true, createdAt: null }
        );

        // Fire the API.
        let result;
        try {
            const res = await api.post(
                "/api/message/bulk-delete-me",
                { messageIds: idsToDelete },
                { withCredentials: true }
            );
            result = res.data;
        } catch (err) {
            // Rollback optimistic UI on total failure.
            idsToDelete.forEach((id) => updateMessageInStore(id, { isDeletedForMe: false }));
            setUndoVisible(false);
            toast.error(err?.response?.data?.error || "Failed to delete messages");
            return;
        }

        // Restore any server-rejected IDs.
        const { failedIds = [] } = result;
        if (failedIds.length > 0) {
            failedIds.forEach((f) => {
                const id = typeof f === "object" ? f.id : f;
                updateMessageInStore(String(id), { isDeletedForMe: false });
            });
            if (failedIds.length === idsToDelete.length) {
                toast.error("Delete failed for selected messages");
                return;
            }
        }

        // Build the set of successfully deleted IDs for the undo window.
        const failedNorms = new Set((failedIds || []).map((f) => String(typeof f === "object" ? f.id : f)));
        const succeededIds = idsToDelete.filter((id) => !failedNorms.has(String(id)));

        pendingDeleteRef.current = { messageIds: succeededIds, conversationId: snapshotConvId };

        setUndoVisible(true);
        setUndoProgress(100);

        const UNDO_MS = 5000;
        const INTERVAL_MS = 50;
        undoProgressIntervalRef.current = setInterval(() => {
            setUndoProgress((prev) => {
                const next = prev - (INTERVAL_MS / UNDO_MS) * 100;
                return next <= 0 ? 0 : next;
            });
        }, INTERVAL_MS);

        undoTimerRef.current = setTimeout(() => {
            pendingDeleteRef.current = null;
            setUndoVisible(false);
            clearInterval(undoProgressIntervalRef.current);
            undoProgressIntervalRef.current = null;
        }, UNDO_MS);

    }, [selectedConversation, displayedMessages, lastMessages, updateMessageInStore, setLastMessage, clearSelection]);

    // ─── Execute Delete for Everyone ──────────────────────────────────────────
    const executeDeleteForEveryone = useCallback(async (idsToDelete) => {
        if (!idsToDelete || idsToDelete.length === 0) return;
        const snapshotConvId = String(selectedConversation?._id || "");

        try {
            const res = await api.post(
                "/api/message/bulk-delete-everyone",
                { messageIds: idsToDelete },
                { withCredentials: true }
            );

            if (res.data?.deletedIds) {
                res.data.deletedIds.forEach((id) => {
                    updateMessageInStore(id, { deletedForAll: true });
                });

                // Update local sidebar preview if the deleted message is current lastMessage
                const deletedSet = new Set(res.data.deletedIds.map(String));
                const currentLast = lastMessages[snapshotConvId];
                if (currentLast && deletedSet.has(String(currentLast._id))) {
                    setLastMessage(snapshotConvId, {
                        ...currentLast,
                        text: "This message was deleted",
                        messageType: "text",
                    });
                }
            }

            clearSelection();
            toast.success("Message deleted for everyone");
        } catch (err) {
            toast.error(err?.response?.data?.error || "Failed to delete for everyone");
        }
    }, [selectedConversation, lastMessages, updateMessageInStore, setLastMessage, clearSelection]);

    // ─── Undo Delete-for-Me handler (Phase 4) ────────────────────────────────
    const handleUndoDelete = useCallback(async () => {
        const pending = pendingDeleteRef.current;
        if (!pending) return;

        // Guard against cross-conversation undo
        const currentConvId = String(selectedConversation?._id || "");
        if (pending.conversationId && pending.conversationId !== currentConvId) {
            return;
        }

        if (undoTimerRef.current) { clearTimeout(undoTimerRef.current); undoTimerRef.current = null; }
        if (undoProgressIntervalRef.current) { clearInterval(undoProgressIntervalRef.current); undoProgressIntervalRef.current = null; }
        pendingDeleteRef.current = null;
        setUndoVisible(false);

        // Optimistic restore.
        pending.messageIds.forEach((id) => updateMessageInStore(id, { isDeletedForMe: false }));

        // Restore sidebar last-message preview if the restored message is the newest visible message
        const restoredSet = new Set(pending.messageIds.map(String));
        const afterUndoVisible = displayedMessages.filter(
            (m) => !m.isDeletedForMe || restoredSet.has(String(m._id))
        );
        const restoredLast = afterUndoVisible[afterUndoVisible.length - 1] || null;
        if (restoredLast) {
            setLastMessage(currentConvId, {
                _id: restoredLast._id,
                text: restoredLast.deletedForAll
                    ? "This message was deleted"
                    : (restoredLast.message || (restoredLast.attachmentUrl ? "📷 Photo" : "")),
                messageType: restoredLast.messageType || (restoredLast.attachmentUrl ? "image" : "text"),
                senderId: restoredLast.senderId,
                status: restoredLast.status || "sent",
                createdAt: restoredLast.createdAt,
                callDetails: restoredLast.callDetails,
            });
        }

        try {
            await api.post(
                "/api/message/restore-delete-me",
                { messageIds: pending.messageIds },
                { withCredentials: true }
            );
        } catch (err) {
            // Server restore failed — re-hide messages.
            pending.messageIds.forEach((id) => updateMessageInStore(id, { isDeletedForMe: true }));
            toast.error(err?.response?.data?.error || "Undo failed — messages remain deleted");
        }
    }, [selectedConversation, displayedMessages, updateMessageInStore, setLastMessage]);

    // ─── Mobile long-press → enter selection mode (Phase 4) ─────────────────
    const handleLongPress = useCallback((messageId) => {
        setIsManualSelectionMode(true);
        setSelectedMessageIds((prev) => {
            const next = new Set(prev);
            next.add(messageId);
            return next;
        });
    }, []);

    // ─── Ownership & Delete-for-Everyone derivation for current selection ────
    let canDeleteForEveryone = isSelectionMode && selectedMessageIds.size > 0;
    if (canDeleteForEveryone) {
        for (const msg of displayedMessages) {
            if (!selectedMessageIds.has(String(msg._id))) continue;
            const msgSenderId = typeof msg.senderId === "object"
                ? String(msg.senderId?._id)
                : String(msg.senderId);
            // Must belong to the current user AND must NOT already be deleted for everyone
            if (msgSenderId !== currentUserId || Boolean(msg.deletedForAll)) {
                canDeleteForEveryone = false;
                break;
            }
        }
    }

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <div
            className="relative flex-1 min-h-0 flex flex-col overflow-hidden bg-transparent"
            onContextMenu={handleContainerContextMenu}
        >
            {/* ── Top Selection Action Bar (Upside Delete Bar) ───────────────────── */}
            {isSelectionMode && (
                <div
                    className="flex-shrink-0 z-30 h-14 px-6 flex items-center justify-between
                               bg-slate-900/98 backdrop-blur-xl border-b border-slate-700/80
                               shadow-md shadow-black/30 animate-in slide-in-from-top duration-200"
                >
                    <div className="flex items-center gap-3">
                        <button
                            id="msg-selection-cancel"
                            onClick={clearSelection}
                            className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                            title="Cancel selection"
                        >
                            <FiX className="text-lg" />
                        </button>
                        <span className="text-sm font-bold text-slate-100 tabular-nums">
                            {selectedMessageIds.size} selected
                        </span>
                    </div>

                    {/* Single Upside Delete Icon */}
                    <div className="flex items-center gap-2">
                        <button
                            id="msg-selection-delete-icon"
                            onClick={() => {
                                if (selectedMessageIds.size > 0) {
                                    setShowDeleteModal(true);
                                } else {
                                    toast("Select at least 1 message to delete");
                                }
                            }}
                            disabled={selectedMessageIds.size === 0}
                            className="p-2.5 rounded-xl text-rose-400 hover:text-white hover:bg-rose-600 bg-rose-600/15 border border-rose-500/30 transition-all shadow-sm disabled:opacity-40 disabled:pointer-events-none"
                            title="Delete selected messages"
                        >
                            <FiTrash2 className="text-base" />
                        </button>
                    </div>
                </div>
            )}

            {/* ── Scrollable Messages Container ───────────────────────────────── */}
            <div
                ref={scrollContainerRef}
                className="relative flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-6 pt-4 pb-1.5 custom-scrollbar"
                style={{ overflowAnchor: "none" }}
            >
                {/* ── WhatsApp-style Sticky Date Indicator ─────────────────── */}
                {stickyDate && (
                    <div
                        className={`sticky top-2 z-30 flex justify-center pointer-events-none transition-all duration-300 ease-out ${isStickyDateVisible
                            ? "opacity-100 translate-y-0 scale-100"
                            : "opacity-0 -translate-y-3.5 scale-95 pointer-events-none"
                            }`}
                    >
                        <div className="px-2.5 py-1 rounded-md bg-[#182229]/80 border border-slate-700/60 text-[10px] font-medium text-slate-300 tracking-wider uppercase shadow-[0_4px_16px_rgba(0,0,0,0.45)] backdrop-blur-md select-none ring-1 ring-white/5">
                            {stickyDate}
                        </div>
                    </div>
                )}

                {/* ── Top loading spinner (older messages) ──────────────────── */}
                {(loadingMore || loadingOlderRef.current) && (
                    <div className="flex justify-center py-2">
                        <FiLoader className="animate-spin text-slate-400 text-base" />
                    </div>
                )}

                {/* ── Messages list ─────────────────────────────────────────── */}
                {loading ? (
                    <Loading isGroup={Boolean(selectedConversation?.isGroup)} />
                ) : visibleMessages.length > 0 ? (
                    <>
                        {/* ── ChitChat Conversation Start Notice ── */}
                        <div className="flex justify-center my-3 select-none">
                            <div className="max-w-xs sm:max-w-sm px-3.5 py-2 rounded-xl bg-slate-900/70 border border-slate-800/80 text-center shadow-sm space-y-0.5">
                                <p className="text-[11px] font-semibold text-slate-300 flex items-center justify-center gap-1.5">
                                    <HiChatBubbleLeftRight className="text-indigo-400 text-xs flex-shrink-0" />
                                    <span>Your conversation starts here.</span>
                                </p>
                                <p className="text-[10px] text-slate-500 leading-snug">
                                    Messages in this chat are securely stored with your ChitChat account.
                                </p>
                            </div>
                        </div>

                        {visibleMessages.map((message, index) => {
                            const showDateSeparator = shouldShowDateSeparator(
                                visibleMessages,
                                index
                            );

                            const prevMsg = visibleMessages[index - 1];
                            const nextMsg = visibleMessages[index + 1];

                            const getSenderId = (m) =>
                                typeof m?.senderId === "object"
                                    ? String(m.senderId?._id)
                                    : String(m?.senderId);

                            const isFirstInSequence =
                                !prevMsg ||
                                getSenderId(prevMsg) !== getSenderId(message) ||
                                !isSameDay(prevMsg, message);
                            const isLastInSequence =
                                !nextMsg ||
                                getSenderId(nextMsg) !== getSenderId(message) ||
                                !isSameDay(nextMsg, message);

                            const showNewMessageSeparator =
                                separatorData !== null &&
                                String(message._id) === String(separatorData.firstId);

                            return (
                                <React.Fragment key={message._id}>
                                    {showDateSeparator && (
                                        <div className="flex items-center gap-3 my-5 select-none">
                                            <div className="flex-1 h-px bg-slate-800" />
                                            <div className="px-3 py-1 rounded-full bg-[#182229] border border-[#26343d] text-[10px] font-semibold text-[#8696a0] tracking-wide shadow-sm">
                                                {getFormattedDateLabel(message.createdAt)}
                                            </div>
                                            <div className="flex-1 h-px bg-slate-800" />
                                        </div>
                                    )}

                                    {/* ── Historical unread separator ───────── */}
                                    {message._id === firstUnreadMessageId &&
                                        unreadCount > 0 && (
                                            <div className="flex items-center gap-3 my-4">
                                                <div className="flex-1 h-px bg-emerald-500/40" />
                                                <div className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-semibold text-emerald-400 whitespace-nowrap">
                                                    {unreadCount} unread message
                                                    {unreadCount > 1 ? "s" : ""}
                                                </div>
                                                <div className="flex-1 h-px bg-emerald-500/40" />
                                            </div>
                                        )}

                                    {/* ── Realtime "N new messages" separator ── */}
                                    {showNewMessageSeparator && (
                                        <div className="flex items-center gap-3 my-4">
                                            <div className="flex-1 h-px bg-emerald-500/40" />
                                            <div className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-semibold text-emerald-400 whitespace-nowrap">
                                                {separatorData.count} new message
                                                {separatorData.count > 1 ? "s" : ""}
                                            </div>
                                            <div className="flex-1 h-px bg-emerald-500/40" />
                                        </div>
                                    )}

                                    <div
                                        data-message-id={String(message._id)}
                                        ref={(element) => {
                                            if (message._id === firstUnreadMessageId) {
                                                firstUnreadRef.current = element;
                                            }
                                        }}
                                    >
                                        <Message
                                            message={message}
                                            isLastInSequence={isLastInSequence}
                                            isFirstInSequence={isFirstInSequence}
                                            isSelected={selectedMessageIds.has(String(message._id))}
                                            isSelectionMode={isSelectionMode}
                                            onSelect={handleToggleSelect}
                                            onLongPress={handleLongPress}
                                            onContextMenu={handleMessageContextMenu}
                                            onAvatarClick={setProfilePopupUser}
                                        />
                                    </div>
                                </React.Fragment>
                            );
                        })}
                        {/* ── Bottom sentinel for reliable scroll-to-bottom ── */}
                        <div ref={messagesEndRef} className="h-2 flex-shrink-0" />
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center my-14 text-center space-y-3 select-none">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-600/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 text-2xl shadow-lg shadow-indigo-500/10">
                            {selectedConversation?.isGroup ? (
                                <FiUsers />
                            ) : (
                                <HiChatBubbleLeftRight />
                            )}
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-bold text-slate-200">No messages here yet</p>
                            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                                {selectedConversation?.isGroup
                                    ? "Send a message to kick off the conversation with the group!"
                                    : `Say hello to ${selectedConversation?.fullname || "your contact"} to start the conversation!`}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* ── ↓ / ↓N Floating Circular Arrow Button (Positioned relative to composer boundary) ── */}
            {arrowState.mode !== "none" && (
                <button
                    id="realtime-arrow-btn"
                    onClick={handleArrowClick}
                    className="absolute bottom-3 right-4 sm:right-6 z-30 w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center
                               bg-[#1e2a30]/95 hover:bg-[#2a3942] text-slate-300 hover:text-white
                               shadow-xl shadow-black/50 backdrop-blur-md border border-[#2a3942]
                               transition-all duration-200 active:scale-90 group ring-1 ring-white/5 select-none"
                    title="Scroll to bottom"
                >
                    <FiChevronDown className="text-xl sm:text-2xl text-slate-300 group-hover:text-white transition-colors flex-shrink-0" />
                    {arrowState.mode === "numbered" && arrowState.count > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-emerald-500 text-slate-950 text-[11px] font-black leading-none flex items-center justify-center shadow-md shadow-emerald-500/40 animate-pulse border-2 border-[#111b21]">
                            {arrowState.count}
                        </span>
                    )}
                </button>
            )}

            {/* ── Multi-Message Delete Modal (via top delete icon) ────────────── */}
            {showDeleteModal && selectedMessageIds.size > 0 && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150 select-none"
                    onClick={() => setShowDeleteModal(false)}
                >
                    <div
                        className="w-full max-w-sm rounded-2xl bg-[#0f172a]/98 border border-slate-700/80 p-5 shadow-[0_16px_50px_rgba(0,0,0,0.85)] backdrop-blur-2xl ring-1 ring-white/10 space-y-4 animate-in zoom-in-95 duration-150"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-3.5">
                            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 flex-shrink-0 mt-0.5">
                                <FiTrash2 className="text-lg" />
                            </div>
                            <div className="space-y-1 min-w-0">
                                <h3 className="text-base font-bold text-slate-100 tracking-tight">
                                    {selectedMessageIds.size > 1
                                        ? `Delete ${selectedMessageIds.size} messages?`
                                        : "Delete message?"}
                                </h3>
                                <p className="text-xs text-slate-400 leading-relaxed">
                                    {canDeleteForEveryone
                                        ? selectedMessageIds.size > 1
                                            ? "Choose whether to delete these messages for everyone or just for yourself."
                                            : "Choose whether to delete this message for everyone or just for yourself."
                                        : "Delete for yourself only (selected messages contain messages from other participants or already deleted messages)."}
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 pt-1">
                            {canDeleteForEveryone && (
                                <button
                                    id="msg-modal-delete-everyone"
                                    onClick={() => {
                                        setShowDeleteModal(false);
                                        executeDeleteForEveryone([...selectedMessageIds].map(String));
                                    }}
                                    className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white shadow-lg shadow-indigo-900/40 border border-indigo-400/30 transition-all duration-150 active:scale-[0.98]"
                                >
                                    Delete for everyone
                                </button>
                            )}
                            <button
                                id="msg-modal-delete-me"
                                onClick={() => {
                                    setShowDeleteModal(false);
                                    executeDeleteForMe([...selectedMessageIds].map(String));
                                }}
                                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-slate-800/90 hover:bg-slate-700/90 text-slate-200 hover:text-white border border-slate-700/80 transition-all duration-150 active:scale-[0.98]"
                            >
                                Delete for me
                            </button>
                            <button
                                id="msg-modal-cancel"
                                onClick={() => setShowDeleteModal(false)}
                                className="w-full py-2 px-4 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all duration-150 active:scale-[0.98]"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Single-Message Delete Modal (via single message right-click) ─── */}
            {showSingleDeleteModal && singleDeleteMessage && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150 select-none"
                    onClick={() => {
                        setShowSingleDeleteModal(false);
                        setSingleDeleteMessage(null);
                    }}
                >
                    <div
                        className="w-full max-w-sm rounded-2xl bg-[#0f172a]/98 border border-slate-700/80 p-5 shadow-[0_16px_50px_rgba(0,0,0,0.85)] backdrop-blur-2xl ring-1 ring-white/10 space-y-4 animate-in zoom-in-95 duration-150"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-3.5">
                            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 flex-shrink-0 mt-0.5">
                                <FiTrash2 className="text-lg" />
                            </div>
                            <div className="space-y-1 min-w-0">
                                <h3 className="text-base font-bold text-slate-100 tracking-tight">
                                    Delete message?
                                </h3>
                                <p className="text-xs text-slate-400 leading-relaxed">
                                    {canDeleteSingleForEveryone(singleDeleteMessage)
                                        ? "Choose whether to delete this message for everyone or just for yourself."
                                        : "Delete this message for yourself only."}
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 pt-1">
                            {canDeleteSingleForEveryone(singleDeleteMessage) && (
                                <button
                                    id="single-msg-delete-everyone"
                                    onClick={() => {
                                        const id = String(singleDeleteMessage._id);
                                        setShowSingleDeleteModal(false);
                                        setSingleDeleteMessage(null);
                                        executeDeleteForEveryone([id]);
                                    }}
                                    className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white shadow-lg shadow-indigo-900/40 border border-indigo-400/30 transition-all duration-150 active:scale-[0.98]"
                                >
                                    Delete for everyone
                                </button>
                            )}
                            <button
                                id="single-msg-delete-me"
                                onClick={() => {
                                    const id = String(singleDeleteMessage._id);
                                    setShowSingleDeleteModal(false);
                                    setSingleDeleteMessage(null);
                                    executeDeleteForMe([id]);
                                }}
                                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-slate-800/90 hover:bg-slate-700/90 text-slate-200 hover:text-white border border-slate-700/80 transition-all duration-150 active:scale-[0.98]"
                            >
                                Delete for me
                            </button>
                            <button
                                id="single-msg-cancel"
                                onClick={() => {
                                    setShowSingleDeleteModal(false);
                                    setSingleDeleteMessage(null);
                                }}
                                className="w-full py-2 px-4 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all duration-150 active:scale-[0.98]"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Context Menu (Pop-up on Right-Click) ─────────────────────────── */}
            {contextMenu && createPortal(
                <div
                    key={`ctx-${contextMenu.x}-${contextMenu.y}-${contextMenu.message?._id || "empty"}`}
                    style={{ position: "fixed", top: `${contextMenu.y}px`, left: `${contextMenu.x}px`, zIndex: 9999 }}
                    className="bg-slate-900/98 backdrop-blur-2xl border border-slate-700/80 rounded-2xl shadow-2xl shadow-black/70 py-1.5 min-w-[175px] text-xs font-medium text-slate-200 select-none animate-wa-context-menu ring-1 ring-white/5"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* If right-clicked on a specific message: Show "React", "Delete message" and "Select message" */}
                    {contextMenu.message ? (
                        <>
                            <button
                                id="msg-context-react"
                                onClick={() => {
                                    const targetId = contextMenu.message?._id;
                                    setContextMenu(null);
                                    if (targetId) {
                                        setActiveReactMessageId(String(targetId));
                                    }
                                }}
                                className="w-full px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-slate-800/80 hover:text-white transition-all duration-150 text-left text-slate-200 active:scale-[0.98]"
                            >
                                <FiSmile className="text-amber-400 text-sm" />
                                <span>React</span>
                            </button>

                            {/* "Copy" option - available only for single text messages that are not deleted */}
                            {!contextMenu.message.deletedForAll &&
                             !contextMenu.message.isDeletedForMe &&
                             typeof contextMenu.message.message === "string" &&
                             contextMenu.message.message.trim().length > 0 && (
                                <button
                                    id="msg-context-copy"
                                    onClick={() => handleCopyMessage(contextMenu.message)}
                                    className="w-full px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-slate-800/80 hover:text-white transition-all duration-150 text-left text-slate-200 border-t border-slate-800/80 active:scale-[0.98]"
                                >
                                    <FiCopy className="text-sky-400 text-sm" />
                                    <span>Copy</span>
                                </button>
                            )}

                            <button
                                id="msg-context-delete"
                                onClick={() => handleDeleteMessageFromContextMenu(contextMenu.message)}
                                className="w-full px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-rose-600/20 hover:text-rose-300 transition-all duration-150 text-left text-rose-400 border-t border-slate-800/80 active:scale-[0.98]"
                            >
                                <FiTrash2 className="text-rose-400 text-sm" />
                                <span>Delete message</span>
                            </button>

                            <button
                                id="msg-context-select-one"
                                onClick={() => handleSelectSpecificMessage(contextMenu.message)}
                                className="w-full px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-indigo-600/25 hover:text-white transition-all duration-150 text-left text-slate-200 border-t border-slate-800/80 active:scale-[0.98]"
                            >
                                <FiCheckSquare className="text-indigo-400 text-sm" />
                                <span>Select message</span>
                            </button>
                        </>
                    ) : (
                        /* If right-clicked on empty space: Show "Select messages", "Clear chat" (if clearable items exist) and "Close chat" */
                        <>
                            <button
                                id="msg-context-select-empty"
                                onClick={handleSelectMessagesEmpty}
                                className="w-full px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-indigo-600/25 hover:text-white transition-all duration-150 text-left text-slate-200 active:scale-[0.98]"
                            >
                                <FiCheckSquare className="text-indigo-400 text-sm" />
                                <span>Select messages</span>
                            </button>

                            {availableRangeOptions.length > 0 && (
                                <button
                                    id="msg-context-clear-chat"
                                    onClick={() => {
                                        setContextMenu(null);
                                        setShowClearChatModal(true);
                                    }}
                                    className="w-full px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-rose-600/20 hover:text-rose-300 transition-all duration-150 text-left text-rose-400 border-t border-slate-800/80 active:scale-[0.98]"
                                >
                                    <FiTrash2 className="text-rose-400 text-sm" />
                                    <span>Clear chat</span>
                                </button>
                            )}

                            <button
                                id="msg-context-close-chat"
                                onClick={handleCloseChatFromContextMenu}
                                className="w-full px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-rose-600/20 hover:text-rose-300 transition-all duration-150 text-left text-rose-400 border-t border-slate-800/80 active:scale-[0.98]"
                            >
                                <FiX className="text-sm" />
                                <span>Close chat</span>
                            </button>
                        </>
                    )}
                </div>,
                document.body
            )}

            {/* ── Clear Chat Time-Range Selection Modal (Minimal Professional Redesign) ─ */}
            {showClearChatModal && createPortal(
                <div
                    className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm select-none"
                    onClick={() => {
                        if (!clearingChat) setShowClearChatModal(false);
                    }}
                >
                    <div
                        className="bg-slate-900 border border-slate-700/80 rounded-xl p-4 sm:p-5 w-[92vw] max-w-sm shadow-xl space-y-3.5 ring-1 ring-white/5"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="space-y-1">
                            <h3 className="text-sm font-semibold text-slate-100">
                                Clear chat
                            </h3>
                            <p className="text-xs text-slate-400">
                                Choose what you want to remove from this conversation.
                            </p>
                        </div>

                        {/* Range Selection List */}
                        {availableRangeOptions.length > 0 ? (
                            <div className="space-y-1.5">
                                {availableRangeOptions.map((option) => {
                                    const isSelected = clearTimeRange === option.id;
                                    return (
                                        <label
                                            key={option.id}
                                            htmlFor={`clear-opt-${option.id}`}
                                            className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition-colors cursor-pointer min-h-[40px] ${
                                                isSelected
                                                    ? "bg-indigo-600/10 border-indigo-500/50 text-slate-100"
                                                    : "bg-slate-800/30 border-slate-700/50 hover:bg-slate-800/60 text-slate-300"
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                id={`clear-opt-${option.id}`}
                                                name="clearTimeRange"
                                                value={option.id}
                                                checked={isSelected}
                                                onChange={() => setClearTimeRange(option.id)}
                                                className="accent-indigo-500 w-3.5 h-3.5 mt-0.5 cursor-pointer"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium leading-tight">{option.title}</p>
                                                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{option.desc}</p>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="py-4 text-center text-xs text-slate-400">
                                No messages or calls to clear.
                            </div>
                        )}

                        {/* Scope Notice */}
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                            This only affects your account. Other participants will still see their copies.
                        </p>

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                                id="cancel-clear-chat-btn"
                                type="button"
                                disabled={clearingChat}
                                onClick={() => setShowClearChatModal(false)}
                                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            {availableRangeOptions.length > 0 && (
                                <button
                                    id="confirm-clear-chat-btn"
                                    type="button"
                                    disabled={clearingChat}
                                    onClick={handleConfirmClearChat}
                                    className="px-4 py-1.5 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white transition disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                                >
                                    {clearingChat ? (
                                        <>
                                            <ImSpinner8 className="animate-spin text-xs" />
                                            <span>Clearing...</span>
                                        </>
                                    ) : (
                                        <span>Clear chat</span>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ── Undo snackbar (Phase 4) ─────────────────────────────────────── */}
            {undoVisible && (
                <div
                    className="fixed bottom-0 left-0 right-0 z-50
                               bg-slate-800/98 backdrop-blur-xl border-t border-slate-700/60
                               shadow-[0_-4px_24px_rgba(0,0,0,0.60)]"
                    style={{ minHeight: "60px" }}
                >
                    <div className="flex items-center justify-between gap-3 px-5 py-3.5">
                        <span className="text-xs font-medium text-slate-300">
                            Message deleted
                        </span>
                        <button
                            id="msg-undo-delete"
                            onClick={handleUndoDelete}
                            className="px-4 py-1.5 rounded-xl text-xs font-bold
                                       text-indigo-400 hover:text-indigo-300
                                       hover:bg-indigo-500/15
                                       transition-colors duration-150 select-none"
                        >
                            Undo
                        </button>
                    </div>
                    {/* 5-second countdown progress bar */}
                    <div
                        className="h-0.5 bg-indigo-500/80 transition-all duration-75 ease-linear"
                        style={{ width: `${undoProgress}%` }}
                    />
                </div>
            )}

            {/* ── Profile Action Popup ── */}
            {profilePopupUser && (
                <ProfileActionPopup
                    user={profilePopupUser}
                    onClose={() => setProfilePopupUser(null)}
                />
            )}
        </div>
    );
}

export default Messages;
