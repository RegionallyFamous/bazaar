<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { wpJson }         from '@bazaar/client';
import type { WpUser, WpPost } from '@bazaar/client';

const user    = ref<WpUser | null>( null );
const posts   = ref<WpPost[]>( [] );
const loading = ref( true );
const error   = ref<string | null>( null );

onMounted( async () => {
  try {
    const [ u, p ] = await Promise.all( [
      wpJson<WpUser>( '/wp/v2/users/me' ),
      wpJson<WpPost[]>( '/wp/v2/posts?per_page=5&status=publish' ),
    ] );
    user.value  = u;
    posts.value = p;
  } catch ( err ) {
    error.value = err instanceof Error ? err.message : 'An error occurred.';
  } finally {
    loading.value = false;
  }
} );
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1>__WARE_NAME__</h1>
      <p v-if="user" class="user-greeting">Hello, {{ user.name }}</p>
    </header>

    <main class="app-main">
      <p v-if="loading" class="status">Loading posts…</p>
      <p v-else-if="error" class="status error">{{ error }}</p>
      <ul v-else class="post-list">
        <li v-for="post in posts" :key="post.id" v-html="post.title.rendered" />
        <li v-if="posts.length === 0" class="status">No posts found.</li>
      </ul>
    </main>
  </div>
</template>

<style src="./App.css" />
