import { configureStore, createSlice } from '@reduxjs/toolkit';

const nftSlice = createSlice({
  name: 'nfts',
  initialState: { list: [], loading: false, error: null },
  reducers: {
    fetchNftsStart: (state) => { state.loading = true; state.error = null; },
    fetchNftsSuccess: (state, action) => { state.loading = false; state.list = action.payload; },
    fetchNftsFailure: (state, action) => { state.loading = false; state.error = action.payload; },
  },
});

export const { fetchNftsStart, fetchNftsSuccess, fetchNftsFailure } = nftSlice.actions;

export const store = configureStore({
  reducer: {
    nfts: nftSlice.reducer,
    // Keep existing reducers if any (e.g., for swaps)
  },
});