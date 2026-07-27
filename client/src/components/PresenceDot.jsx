const PresenceDot = ({ isOnline }) => (
  <span
    className={`presence-dot ${isOnline ? "online" : "offline"}`}
    aria-label={isOnline ? "Online" : "Offline"}
    title={isOnline ? "Online" : "Offline"}
  />
);

export default PresenceDot;
