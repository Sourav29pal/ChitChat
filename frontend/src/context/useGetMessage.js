import { useCallback, useEffect, useRef, useState } from "react";
import useConversation from "../zustand/useConversation.js";
import api from "../api";

const useGetMessage = () => {
    const {
        messages,
        setMessage,
        selectedConversation,
        addHistoricalAndPurgeRealtime,
        clearRealtimeMessages,
    } = useConversation();

    const [loading, setLoading] = useState(Boolean(selectedConversation?._id));
    const [loadingMore, setLoadingMore] = useState(false);
    const [loadingNewer, setLoadingNewer] = useState(false);
    const [loadingUnreadBacklog, setLoadingUnreadBacklog] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [hasMoreAfter, setHasMoreAfter] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [firstUnreadMessageId, setFirstUnreadMessageId] = useState(null);
    const [lastUnreadMessageId, setLastUnreadMessageId] = useState(null);
    const [loadedConversationId, setLoadedConversationId] = useState(null);

    const oldestMsgIdRef = useRef(null);
    const newestMsgIdRef = useRef(null);
    const lastUnreadMessageIdRef = useRef(null);

    const unreadBacklogCompleteRef = useRef(false);

    const loadingMoreRef = useRef(false);
    const loadingNewerRef = useRef(false);
    const loadingUnreadBacklogRef = useRef(false);

    const hasMoreRef = useRef(false);
    const hasMoreAfterRef = useRef(false);

    useEffect(() => {
        hasMoreRef.current = hasMore;
    }, [hasMore]);

    useEffect(() => {
        hasMoreAfterRef.current = hasMoreAfter;
    }, [hasMoreAfter]);

    useEffect(() => {
        const conversationId = selectedConversation?._id;

        setLoadedConversationId(null);

        if (!conversationId) {
            setMessage([]);
            clearRealtimeMessages();
            setUnreadCount(0);
            setFirstUnreadMessageId(null);
            setLastUnreadMessageId(null);
            setHasMore(false);
            setHasMoreAfter(false);
            setLoadingUnreadBacklog(false);

            oldestMsgIdRef.current = null;
            newestMsgIdRef.current = null;
            lastUnreadMessageIdRef.current = null;
            unreadBacklogCompleteRef.current = false;

            loadingUnreadBacklogRef.current = false;

            hasMoreRef.current = false;
            hasMoreAfterRef.current = false;

            return;
        }

        let cancelled = false;

        const getMessages = async () => {
            /*
             * IMPORTANT:
             * Clear both the historical and the realtime collections immediately.
             *
             * This prevents Messages.jsx from initializing
             * against stale messages when the chat is reopened.
             */
            setMessage([]);
            clearRealtimeMessages();

            setLoading(true);
            setLoadingMore(false);
            setUnreadCount(0);
            setFirstUnreadMessageId(null);
            setHasMore(false);
            setHasMoreAfter(false);
            setLoadingUnreadBacklog(false);

            oldestMsgIdRef.current = null;
            newestMsgIdRef.current = null;
            lastUnreadMessageIdRef.current = null;
            unreadBacklogCompleteRef.current = false;

            hasMoreRef.current = false;
            hasMoreAfterRef.current = false;

            loadingMoreRef.current = false;
            loadingNewerRef.current = false;
            loadingUnreadBacklogRef.current = false;

            try {
                const res = await api.get(`/api/message/get/${conversationId}?limit=30`);

                if (cancelled) return;

                const data = res.data || {};
                const fetched = Array.isArray(data)
                    ? data
                    : Array.isArray(data.messages)
                    ? data.messages
                    : [];
                const hasMoreBefore = Boolean(data.hasMoreBefore || data.hasMore);
                const pageHasMoreAfter = Boolean(data.hasMoreAfter);
                const pageUnread = data.unreadCount || 0;
                const pageFirstUnread = data.firstUnreadMessageId || null;
                const pageLastUnread = data.lastUnreadMessageId || null;

                const unread = pageUnread || 0;
                const firstUnread = unread > 0 ? pageFirstUnread : null;
                const lastUnread = unread > 0 ? pageLastUnread : null;

                setMessage(fetched);

                setUnreadCount(unread);
                setFirstUnreadMessageId(firstUnread);

                setLastUnreadMessageId(lastUnread);
                lastUnreadMessageIdRef.current = lastUnread;
                unreadBacklogCompleteRef.current = !lastUnread;

                if (fetched.length > 0) {
                    oldestMsgIdRef.current = fetched[0]._id;
                    newestMsgIdRef.current = fetched[fetched.length - 1]._id;
                }

                hasMoreRef.current = hasMoreBefore;
                hasMoreAfterRef.current = pageHasMoreAfter;

                setHasMore(hasMoreBefore);
                setHasMoreAfter(pageHasMoreAfter);

                setLoadedConversationId(conversationId);

                /*
                 * Mark as seen only after the messages required
                 * for the unread separator have been loaded.
                 */
                await api.put(`/api/message/seen/${conversationId}`).catch(() => {});
            } catch (error) {
                if (!cancelled) {
                    console.log("Error fetching messages:", error);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        getMessages();

        return () => {
            cancelled = true;
        };
    }, [selectedConversation?._id, setMessage, clearRealtimeMessages]);

    // Loads the next page of older (earlier) messages by prepending to the
    // historical array.  Never touches realtimeMessages[].
    const loadMoreMessages = useCallback(async () => {
        const conversationId = selectedConversation?._id;

        if (!conversationId) return;
        if (!hasMoreRef.current) return;
        if (loadingMoreRef.current) return;
        if (!oldestMsgIdRef.current) return;

        loadingMoreRef.current = true;
        setLoadingMore(true);

        try {
            const before = oldestMsgIdRef.current;

            const data = res.data || {};
            const olderMessages = Array.isArray(data)
                ? data
                : Array.isArray(data.messages)
                ? data.messages
                : [];
            const hasMoreBefore = Boolean(data.hasMoreBefore || data.hasMore);

            if (olderMessages.length > 0) {
                // Atomically: prepend unique older messages to messages[] and
                // remove any overlapping IDs from realtimeMessages[] (in practice
                // older pages never overlap with realtime, but we include it for
                // safety to guarantee the invariant).
                addHistoricalAndPurgeRealtime(olderMessages, "before");
                oldestMsgIdRef.current = olderMessages[0]._id;
            }

            hasMoreRef.current = hasMoreBefore;
            setHasMore(hasMoreBefore);
        } catch (error) {
            console.log("Error loading more messages:", error);
        } finally {
            loadingMoreRef.current = false;
            setLoadingMore(false);
        }
    }, [selectedConversation?._id, addHistoricalAndPurgeRealtime]);

    // Fills the gap between the initially loaded window and lastUnreadMessageId
    // by fetching pages of messages in ascending order.
    // Only touches historical messages[].  The realtime collection is untouched
    // unless a fetched message also happens to be in realtimeMessages[] — in
    // which case it is removed from realtimeMessages[] atomically.
    const loadUnreadBacklog = useCallback(async () => {
        const conversationId = selectedConversation?._id;

        if (!conversationId) return false;
        if (unreadBacklogCompleteRef.current) return true;
        if (loadingUnreadBacklogRef.current) return false;
        if (!lastUnreadMessageIdRef.current) return false;
        if (!newestMsgIdRef.current) return false;

        loadingUnreadBacklogRef.current = true;
        setLoadingUnreadBacklog(true);

        try {
            while (!unreadBacklogCompleteRef.current) {
                const after = newestMsgIdRef.current;
                const lastUnread = lastUnreadMessageIdRef.current;

                const res = await api.get(`/api/message/get/${conversationId}?limit=30&after=${after}&until=${lastUnread}`);

                const data = res.data || {};
            const newerMessages = Array.isArray(data)
                ? data
                : Array.isArray(data.messages)
                ? data.messages
                : [];

                if (newerMessages.length === 0) {
                    return false;
                }

                let reachedLastUnread = false;

                for (const message of newerMessages) {
                    if (String(message._id) === String(lastUnread)) {
                        reachedLastUnread = true;
                        break;
                    }
                }

                // Atomically: append unique messages to messages[] and remove
                // any overlapping IDs from realtimeMessages[].
                addHistoricalAndPurgeRealtime(newerMessages, "after");

                newestMsgIdRef.current = newerMessages[newerMessages.length - 1]._id;

                if (reachedLastUnread) {
                    unreadBacklogCompleteRef.current = true;
                    break;
                }
            }

            return unreadBacklogCompleteRef.current;
        } catch (error) {
            console.log("Error loading unread backlog:", error);
            return false;
        } finally {
            loadingUnreadBacklogRef.current = false;
            setLoadingUnreadBacklog(false);
        }
    }, [selectedConversation?._id, addHistoricalAndPurgeRealtime]);

    // Loads messages newer than the current cursor when the user scrolls near
    // the bottom and hasMoreAfter is true.
    // Same atomic pattern as loadUnreadBacklog.
    const loadNewerMessages = useCallback(async () => {
        const conversationId = selectedConversation?._id;

        if (!conversationId) return;

        if (!hasMoreAfterRef.current && unreadBacklogCompleteRef.current === false) {
            return;
        }

        if (loadingNewerRef.current) return;
        if (!newestMsgIdRef.current) return;

        loadingNewerRef.current = true;
        setLoadingNewer(true);

        try {
            const after = newestMsgIdRef.current;
            const lastUnread = lastUnreadMessageIdRef.current;

            const url =
                !unreadBacklogCompleteRef.current && lastUnread
                    ? `/api/message/get/${conversationId}?limit=30&after=${after}&until=${lastUnread}`
                    : `/api/message/get/${conversationId}?limit=30&after=${after}`;

            const res = await api.get(url);

            const { messages: newerMessages = [], hasMoreAfter = false } = res.data;

            if (newerMessages.length > 0) {
                // Atomically: append unique messages to messages[] and remove
                // any overlapping IDs from realtimeMessages[].
                addHistoricalAndPurgeRealtime(newerMessages, "after");

                newestMsgIdRef.current = newerMessages[newerMessages.length - 1]._id;
            }

            const reachedLastUnread =
                !unreadBacklogCompleteRef.current &&
                lastUnreadMessageIdRef.current &&
                newerMessages.some((msg) => String(msg._id) === String(lastUnreadMessageIdRef.current));

            if (reachedLastUnread) {
                unreadBacklogCompleteRef.current = true;
            }

            hasMoreAfterRef.current = hasMoreAfter;
            setHasMoreAfter(hasMoreAfter);
        } catch (error) {
            console.log("Error loading newer messages:", error);
        } finally {
            loadingNewerRef.current = false;
            setLoadingNewer(false);
        }
    }, [selectedConversation?._id, addHistoricalAndPurgeRealtime]);

    return {
        loading,
        loadingMore,
        loadingNewer,
        loadingUnreadBacklog,
        hasMore,
        hasMoreAfter,
        messages,
        loadMoreMessages,
        loadUnreadBacklog,
        loadNewerMessages,
        unreadCount,
        firstUnreadMessageId,
        lastUnreadMessageId,
        loadedConversationId,
    };
};

export default useGetMessage;
